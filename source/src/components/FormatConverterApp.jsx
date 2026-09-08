import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { Download, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ImageToPdfApp from './ImageToPdfApp';
import { convertWordToPdf } from '@/lib/pdfUtils';
import { canAcceptConversionFiles, classifyConversionFile, convertExcelToPdf, createUniqueOutputNames } from '@/lib/formatConversion';

const tabs = [
  { id: 'image', label: '图片转 PDF', icon: ImageIcon },
  { id: 'word', label: 'Word 转 PDF', icon: FileText },
  { id: 'excel', label: 'Excel 转 PDF', icon: FileSpreadsheet },
];

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FormatConverterApp() {
  const [tab, setTab] = useState('image');
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const generationRef = useRef(0);
  const addFiles = (files) => {
    if (!canAcceptConversionFiles(converting)) return;
    const accepted = [...files].filter((file) => classifyConversionFile(file) === tab);
    if (!accepted.length) return toast.error(tab === 'word' ? '请选择 DOCX 文件' : '请选择 XLS 或 XLSX 文件');
    setItems((current) => [...current, ...accepted.map((file) => ({ id: `${Date.now()}-${Math.random()}`, file, status: 'waiting' }))]);
  };
  const convertItem = async (item, generation = generationRef.current) => {
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'converting' } : entry));
    try {
      const result = tab === 'word' ? await convertWordToPdf(item.file) : await convertExcelToPdf(item.file);
      const blob = new Blob([result.bytes], { type: 'application/pdf' });
      if (generation !== generationRef.current) return null;
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'done', blob, outputName: result.name, pageCount: result.pageCount } : entry));
      return { ...item, blob, outputName: result.name };
    } catch (error) {
      if (generation === generationRef.current) setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'error', error: error.message } : entry));
      return null;
    }
  };
  const convertAll = async () => {
    if (converting) return;
    const generation = generationRef.current;
    setConverting(true);
    const pending = items.filter((item) => item.status !== 'done');
    try {
      for (const item of pending) await convertItem(item, generation);
    } finally {
      if (generation === generationRef.current) setConverting(false);
    }
  };
  const downloadZip = async () => {
    if (converting) return;
    const generation = generationRef.current;
    setConverting(true);
    const ready = [];
    try {
      for (const item of items) {
        if (item.status === 'done') ready.push(item);
        else {
          const converted = await convertItem(item, generation);
          if (converted) ready.push(converted);
        }
      }
      if (generation !== generationRef.current) return;
      if (!ready.length) return toast.error('没有可下载的转换结果');
      const names = createUniqueOutputNames(ready.map((item) => item.outputName));
      const zip = new JSZip();
      ready.forEach((item, index) => zip.file(names[index], item.blob));
      downloadBlob(await zip.generateAsync({ type: 'blob' }), '格式转换结果.zip');
    } finally {
      if (generation === generationRef.current) setConverting(false);
    }
  };
  const switchTab = (value) => { if (!converting) { generationRef.current += 1; setTab(value); setItems([]); } };
  if (tab === 'image') return <div className="format-converter"><ConverterTabs tab={tab} onChange={switchTab} disabled={converting} /><ImageToPdfApp /></div>;
  const accept = tab === 'word' ? '.docx' : '.xls,.xlsx';
  return (
    <div className="tool-page format-converter">
      <ConverterTabs tab={tab} onChange={switchTab} disabled={converting} />
      <div className="page-intro"><div><h1>{tab === 'word' ? 'Word 转 PDF' : 'Excel 转 PDF'}</h1></div></div>
      <Card className={`converter-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={(event) => event.preventDefault()} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (canAcceptConversionFiles(converting)) addFiles(event.dataTransfer.files); }}>
        <Upload /><strong>点击或拖入多个{tab === 'word' ? ' DOCX' : ' Excel'} 文件</strong>
        <span>每个源文件生成一个独立 PDF，全程在本机浏览器处理</span>
        <input type="file" aria-label={tab === 'word' ? '选择 Word 文件' : '选择 Excel 文件'} multiple accept={accept} disabled={converting} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
      </Card>
      {tab === 'excel' && <p className="converter-limit">Excel 默认按 A4 横向一页宽输出，长表自动分页。尽量保留单元格样式；图表、宏、打印区域、页眉页脚和特殊字体可能与 Office 不完全一致。</p>}
      {tab === 'word' && <p className="converter-limit">支持 DOCX 正文、图片和表格。复杂页眉页脚、浮动图片及分页可能与 Office 不同；需要严格保留原版式时，请在 Office 中另存为 PDF。</p>}
      {items.length > 0 && <Card className="converter-queue">
        <div className="converter-queue-head"><strong>{items.length} 个文件</strong><div><Button variant="outline" onClick={convertAll} disabled={converting}>全部转换</Button><Button onClick={downloadZip} disabled={converting}><FileArchive />ZIP 下载</Button><Button variant="ghost" disabled={converting} onClick={() => { generationRef.current += 1; setItems([]); }}><Trash2 />清空</Button></div></div>
        {items.map((item) => <div className="converter-item" key={item.id}>
          <div><strong>{item.file.name}</strong><small>{item.status === 'waiting' ? '等待转换' : item.status === 'converting' ? '正在转换…' : item.status === 'done' ? `已完成 · ${item.pageCount || ''} 页` : `失败：${item.error}`}</small></div>
          <div><Button variant="outline" size="sm" onClick={async () => { setConverting(true); try { await convertItem(item, generationRef.current); } finally { setConverting(false); } }} disabled={converting}>{item.status === 'done' ? '重新转换' : '转换'}</Button>{item.blob && <Button size="sm" disabled={converting} onClick={() => downloadBlob(item.blob, item.outputName)}><Download />下载</Button>}<Button variant="ghost" size="sm" disabled={converting} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>移除</Button></div>
        </div>)}
      </Card>}
    </div>
  );
}

function ConverterTabs({ tab, onChange, disabled }) {
  return <div className="converter-tabs" role="tablist">{tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" disabled={disabled} aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => onChange(id)}><Icon />{label}</button>)}</div>;
}
