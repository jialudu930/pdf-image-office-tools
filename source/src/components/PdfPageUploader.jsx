import { Upload } from 'lucide-react';
import { useCallback } from 'react';
import { Card } from '@/components/ui/card';

export default function PdfPageUploader({ onFileAdded }) {
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (file) onFileAdded(file);
  }, [onFileAdded]);

  const handleChange = (e) => {
    if (e.target.files[0]) onFileAdded(e.target.files[0]);
    e.target.value = '';
  };

  return (
    <Card className="upload-card">
      <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
        onClick={() => document.getElementById('pdf-page-input').click()}
        className="upload-dropzone">
        <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">点击或拖拽上传 PDF 文件</p>
        <p className="text-xs text-muted-foreground mt-1">支持 .pdf 格式</p>
        <input id="pdf-page-input" type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleChange} />
      </div>
    </Card>
  );
}
