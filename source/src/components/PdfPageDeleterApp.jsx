import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PDFDocument } from 'pdf-lib';
import { Button } from '@/components/ui/button';
import PdfPageUploader from './PdfPageUploader';
import PdfPageSettings from './PdfPageSettings';
import PdfWorkspace from './pdf/PdfWorkspace';
import { removePdfPages } from '@/lib/pdfUtils';

export default function PdfPageDeleterApp() {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [deletedPages, setDeletedPages] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFile = useCallback(async (file) => {
    try {
      setIsLoading(true);
      setDeletedPages(new Set());

      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const count = pdf.getPageCount();

      setPdfBytes(bytes);
      setPageCount(count);
      setFileName(file.name);

      toast.success(`已加载 ${file.name}，共 ${count} 页`);
    } catch (e) {
      console.error(e);
      toast.error('PDF 加载失败');
      setPdfBytes(null);
      setPageCount(0);
      setFileName('');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearAll = useCallback(() => {
    setPdfBytes(null); setPageCount(0); setFileName(''); setDeletedPages(new Set()); toast.info('已清除');
  }, []);

  const exportPdf = useCallback(async (name) => {
    if (!pdfBytes || deletedPages.size === 0) return toast.error('请至少标记一页删除');
    if (deletedPages.size === pageCount) return toast.error('不能删除所有页面');
    setIsProcessing(true);
    try {
      const outputBytes = await removePdfPages(pdfBytes, deletedPages);
      const blob = new Blob([outputBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name.endsWith('.pdf') ? name : `${name}.pdf`; a.click();
      URL.revokeObjectURL(url); toast.success('新 PDF 已生成');
    } catch { toast.error('生成失败'); }
    setIsProcessing(false);
  }, [pdfBytes, deletedPages, pageCount]);

  return (
    <div className="tool-page">
      <div className="page-intro">
        <div>
          <h1>PDF 删页</h1>
        </div>
      </div>
      {!pdfBytes ? <PdfPageUploader onFileAdded={handleFile} /> : <>
        <div className="file-banner">
          <div className="flex items-center gap-3">
            <div className="file-kind">PDF</div>
            <div>
              <p className="text-sm font-medium">{fileName}</p>
              <p className="text-xs text-muted-foreground">{pageCount} 页</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-destructive hover:text-destructive">移除文件</Button>
        </div>
        {!isLoading && (
          <PdfWorkspace
            bytes={pdfBytes}
            deletedPages={deletedPages}
            onDeletedPagesChange={setDeletedPages}
            title="逐页预览与删页"
          />
        )}
        <PdfPageSettings onExport={exportPdf} disabled={deletedPages.size === 0 || deletedPages.size === pageCount} isProcessing={isProcessing} />
      </>}
    </div>
  );
}
