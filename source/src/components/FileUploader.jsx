import { Upload } from 'lucide-react';
import { useCallback } from 'react';
import { Card } from '@/components/ui/card';

export default function FileUploader({ onFilesAdded, disabled = false }) {
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    if (!disabled) onFilesAdded(Array.from(event.dataTransfer.files));
  }, [onFilesAdded, disabled]);

  const handleChange = (event) => {
    onFilesAdded(Array.from(event.target.files));
    event.target.value = '';
  };

  return (
    <Card className="upload-card">
      <label
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        className="upload-dropzone"
      >
        <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">点击或拖拽上传 PDF / Word 文件</p>
        <p className="mt-1 text-xs text-muted-foreground">支持 .pdf、.docx 格式，可一次选择多个文件</p>
        <input aria-label="上传 PDF 或 Word 文件" disabled={disabled} type="file" multiple accept=".pdf,.docx" className="sr-only" onChange={handleChange} />
      </label>
    </Card>
  );
}
