import { Upload } from 'lucide-react';
import { useCallback, useId } from 'react';
import { Card } from '@/components/ui/card';

export default function ImageUploader({ onFilesAdded, disabled = false, compact = false }) {
  const inputId = useId();
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (disabled) return;
    onFilesAdded(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
  }, [disabled, onFilesAdded]);

  const handleChange = (e) => {
    if (disabled) return;
    onFilesAdded(Array.from(e.target.files));
    e.target.value = '';
  };

  return (
    <Card className={compact ? 'panorama-add-control' : 'panorama-upload-card'}>
      <label
        htmlFor={inputId}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        aria-disabled={disabled}
        className={`${compact ? 'panorama-add-label' : 'panorama-upload-label'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <Upload className={compact ? 'h-4 w-4' : 'mx-auto h-10 w-10 text-muted-foreground mb-3'} />
        <p className="text-sm font-medium">点击或拖拽上传图片</p>
        {!compact && <p className="text-xs text-muted-foreground mt-1">支持 PNG、JPG 等常见图片格式</p>}
      </label>
      <input id={inputId} aria-label="点击或拖拽上传图片" disabled={disabled} type="file" multiple accept="image/*" className="sr-only" onChange={handleChange} />
    </Card>
  );
}
