import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import FileUploader from './FileUploader';
import FileList from './FileList';
import MergeSettings from './MergeSettings';
import { getPdfInfo, convertWordToPdf, mergeDocuments } from '@/lib/pdfUtils';
import PdfWorkspace from './pdf/PdfWorkspace';
import { createPageMetadata } from '@/lib/pdfWorkspace';
import { organizePdf } from '@/lib/pdfOrganizer';
import { downloadFile } from '@/lib/download';
import { parsePageRange } from '@/lib/pdfEditorModel';
import { Button } from '@/components/ui/button';
import JSZip from 'jszip';

export default function PdfMergerApp() {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewBytes, setPreviewBytes] = useState(null);
  const [deletedPages, setDeletedPages] = useState(new Set());
  const [previewError, setPreviewError] = useState('');
  const [order, setOrder] = useState([]);
  const [rotations, setRotations] = useState({});
  const [extractRange, setExtractRange] = useState('全部');
  const processingRef = useRef(false);

  const pageMetadata = useMemo(() => createPageMetadata(files), [files]);

  useEffect(() => {
    let cancelled = false;
    setDeletedPages(new Set());
    setPreviewBytes(null);
    setPreviewError('');
    setOrder(createPageMetadata(files).map((p) => p.outputPageNumber));
    setRotations({});
    if (!files.length) return undefined;
    mergeDocuments(files).then((bytes) => {
      if (!cancelled) setPreviewBytes(bytes);
    }).catch(() => {
      if (!cancelled) setPreviewError('合并预览生成失败，请检查上传的文件。');
    });
    return () => { cancelled = true; };
  }, [files]);

  const addFiles = useCallback(async (newFiles) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    const loaded = [];
    for (const file of newFiles) {
      if (!file.name.match(/\.(pdf|docx)$/i)) {
        toast.error(`${file.name} 格式不支持`);
        continue;
      }
      try {
        const info = /\.pdf$/i.test(file.name) ? await getPdfInfo(file) : await convertWordToPdf(file);
        loaded.push(info);
      } catch {
        toast.error(`${file.name} 处理失败`);
      }
    }
    setFiles(f => [...f, ...loaded]);
    processingRef.current = false;
    setIsProcessing(false);
  }, []);

  const moveFile = (i, d) => setFiles(f => {
    const n = [...f], t = i + d;
    [n[i], n[t]] = [n[t], n[i]];
    return n;
  });

  const removeFile = (i) => setFiles(f => f.filter((_, idx) => idx !== i));

  const clearAllFiles = useCallback(() => {
    if (processingRef.current) return;
    setFiles([]);
    toast.info('已清除所有文件');
  }, []);

  const merge = async (name) => {
    if (files.length < 1) return toast.error('请先添加 PDF 文件');
    setIsProcessing(true);
    try {
      const bytes = await organizePdf(previewBytes, order.filter((n) => !deletedPages.has(n)), rotations);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      downloadFile(blob, /\.pdf$/i.test(name) ? name : `${name || '合并文档'}.pdf`);
      toast.success(files.length === 1 ? 'PDF 已导出' : '合并完成');
    } catch {
      toast.error('合并失败');
    }
    setIsProcessing(false);
  };

  const exportSelection = async (split) => {
    if (!previewBytes || isProcessing) return;
    setIsProcessing(true);
    try {
      const selected = new Set(parsePageRange(extractRange, pageMetadata.length));
      const pages = order.filter((n) => selected.has(n) && !deletedPages.has(n));
      if (!pages.length) throw new Error('请填写有效页码，至少保留一页');
      if (split) {
        const zip = new JSZip();
        for (const [index, page] of pages.entries()) zip.file(`${index + 1}-原第${page}页.pdf`, await organizePdf(previewBytes, [page], rotations));
        downloadFile(await zip.generateAsync({ type: 'blob' }), 'PDF逐页拆分.zip');
      } else downloadFile(new Blob([await organizePdf(previewBytes, pages, rotations)], { type: 'application/pdf' }), '提取页面.pdf');
    } catch (error) { toast.error(error.message || '导出失败'); }
    finally { setIsProcessing(false); }
  };

  return (
    <div className="tool-page">
      <div className="page-intro">
        <div>
          <h1>PDF 合并与整理</h1>
        </div>
      </div>
      <FileUploader onFilesAdded={addFiles} disabled={isProcessing} />
      <fieldset disabled={isProcessing}><FileList files={files} onMove={moveFile} onRemove={removeFile} onClearAll={clearAllFiles} /></fieldset>
      {isProcessing && <p role="status">正在处理文件…</p>}
      {previewError && <div className="workspace-error"><strong>无法生成预览</strong><p>{previewError}</p></div>}
      {files.length > 0 && !previewError && (
        <PdfWorkspace
          bytes={previewBytes}
          deletedPages={deletedPages}
          onDeletedPagesChange={setDeletedPages}
          pageMetadata={pageMetadata}
          title="合并结果预览"
          order={order}
          onOrderChange={setOrder}
          rotations={rotations}
          onRotate={(n) => setRotations((current) => ({ ...current, [n]: ((current[n] || 0) + 90) % 360 }))}
        />
      )}
      {previewBytes && <div className="compact-actions"><label>提取范围 <input aria-label="提取页码范围" value={extractRange} onChange={(e) => setExtractRange(e.target.value)} placeholder="全部 或 1,3-5" /></label><Button variant="outline" disabled={isProcessing} onClick={() => exportSelection(false)}>提取为一个 PDF</Button><Button variant="outline" disabled={isProcessing} onClick={() => exportSelection(true)}>逐页拆分 ZIP</Button></div>}
      <MergeSettings
        count={files.length}
        onMerge={merge}
        isProcessing={isProcessing}
        previewReady={Boolean(previewBytes)}
        outputPages={pageMetadata.length - deletedPages.size}
      />
    </div>
  );
}
