import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from '@/lib/pdfLoader';
import { downloadFile, formatBytes } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import JSZip from 'jszip';

export default function CompressionApp({ kind }) {
  const [files, setFiles] = useState([]);
  const [quality, setQuality] = useState(75);
  const [mode, setMode] = useState('lossless');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState([]);
  const isPdf = kind === 'pdf';
  const addFiles = (incoming) => {
    if (busy) return;
    const accepted = [...incoming].filter((f) => isPdf ? /\.pdf$/i.test(f.name) : /\.(png|jpe?g|webp)$/i.test(f.name));
    if (accepted.length !== incoming.length) toast.error('部分文件格式不支持');
    setFiles((prev) => [...prev, ...accepted]);
    setResults([]);
  };
  const run = async () => {
    setBusy(true);
    const output = [];
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`正在压缩 ${index + 1} / ${files.length}：${file.name}`);
        try {
          let bytes, name = file.name;
          if (isPdf) {
            const source = await file.arrayBuffer();
            if (mode === 'lossless') {
              const pdf = await PDFDocument.load(source);
              bytes = await pdf.save({ useObjectStreams: true });
            } else {
              const task = getDocument({ data: new Uint8Array(source.slice(0)) });
              const pdf = await task.promise;
              try {
                const result = await PDFDocument.create();
                for (let n = 1; n <= pdf.numPages; n++) {
                  setProgress(`文件 ${index + 1}/${files.length} · 第 ${n}/${pdf.numPages} 页`);
                  const page = await pdf.getPage(n);
                  const original = page.getViewport({ scale: 1 });
                  const scale = Math.min(1.5, 2400 / Math.max(original.width, original.height));
                  const viewport = page.getViewport({ scale });
                  const canvas = document.createElement('canvas');
                  canvas.width = viewport.width; canvas.height = viewport.height;
                  await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
                  const image = await result.embedJpg(canvas.toDataURL('image/jpeg', quality / 100));
                  result.addPage([original.width, original.height]).drawImage(image, { x: 0, y: 0, width: original.width, height: original.height });
                  canvas.width = 0; canvas.height = 0;
                }
                bytes = await result.save();
              } finally { await task.destroy(); }
            }
          } else {
            const url = URL.createObjectURL(file);
            try {
              const image = new Image();
              await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('无法读取图片')); image.src = url; });
              const scale = Math.min(1, 4096 / Math.max(image.width, image.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
              const context = canvas.getContext('2d');
              context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              bytes = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片过大')), 'image/jpeg', quality / 100));
              name = file.name.replace(/\.[^.]+$/, '.jpg');
              canvas.width = 0;
            } finally { URL.revokeObjectURL(url); }
          }
          let blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'application/pdf' });
          const smaller = blob.size < file.size;
          if (!smaller) { blob = file; name = file.name; }
          output.push({ name, blob, originalSize: file.size, smaller });
          setResults([...output]);
        } catch (error) { toast.error(`${file.name}：${error.message || '压缩失败，请检查文件'}`); }
      }
    } finally { setBusy(false); setProgress(''); }
  };
  const downloadAll = async () => {
    try {
      const zip = new JSZip();
      results.forEach((r, i) => zip.file(`${i + 1}-${r.name}`, r.blob));
      downloadFile(await zip.generateAsync({ type: 'blob' }), '压缩结果.zip');
    } catch { toast.error('打包失败，请逐个下载'); }
  };
  return <div className="tool-page">
    <div className="page-intro"><h1>{isPdf ? 'PDF 压缩' : '图片压缩'}</h1></div>
    <label className="upload-dropzone block" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      <strong>点击或拖入{isPdf ? ' PDF' : '图片'}文件</strong>
      <input className="sr-only" type="file" aria-label="选择待压缩文件" disabled={busy} multiple accept={isPdf ? '.pdf' : '.png,.jpg,.jpeg,.webp'} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
    </label>
    <div className="compact-actions">
      {isPdf && <label>压缩方式 <select value={mode} disabled={busy} onChange={(e) => { setMode(e.target.value); setResults([]); }}><option value="lossless">无损优化（保留文字）</option><option value="image">扫描件压缩（转为图片）</option></select></label>}
      {(!isPdf || mode === 'image') && <label>画质 {quality}% <input type="range" min="30" max="95" value={quality} disabled={busy} onChange={(e) => { setQuality(Number(e.target.value)); setResults([]); }} /></label>}
      <Button onClick={run} disabled={busy || !files.length}>{busy ? '正在压缩…' : '开始压缩'}</Button>
      {files.length > 0 && <Button variant="outline" disabled={busy} onClick={() => { setFiles([]); setResults([]); }}>清空</Button>}
    </div>
    {isPdf && mode === 'image' && <p className="converter-limit">适用于扫描件。输出不再保留可选文字、链接及表单。</p>}
    {!isPdf && <p className="converter-limit">输出 JPG，透明区域转为白色。</p>}
    {progress && <p role="status">{progress}</p>}
    {!results.length && files.map((f, i) => <div className="converter-item" key={i}><span>{f.name} · {formatBytes(f.size)}</span><Button variant="ghost" disabled={busy} onClick={() => setFiles(files.filter((_, n) => n !== i))}>移除</Button></div>)}
    {results.map((r, i) => <div className="converter-item" key={i}><div><strong>{r.name}</strong><small>{formatBytes(r.originalSize)} → {formatBytes(r.blob.size)} · {r.smaller ? `减小 ${Math.round((1 - r.blob.size / r.originalSize) * 100)}%` : '已保留更小的原文件'}</small></div><Button onClick={() => downloadFile(r.blob, r.name)}>下载</Button></div>)}
    {results.length > 1 && <Button className="mt-4" onClick={downloadAll}>全部下载 ZIP</Button>}
  </div>;
}
