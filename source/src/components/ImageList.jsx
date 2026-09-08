import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ImageList({ files, selectedId, onSelect, onMove, onRemove, disabled = false }) {
  if (!files.length) return null;
  return <div className="panorama-order-strip" role="list" aria-label="图片拼接顺序">
    {files.map((file, index) => <div key={file.id} role="listitem" className={`panorama-order-item ${selectedId === file.id ? 'selected' : ''}`}>
      <button disabled={disabled} type="button" className="panorama-order-select" onClick={() => onSelect(file.id)} aria-label={`选择 ${file.name}`} aria-pressed={selectedId === file.id}>
        <span>{index + 1}</span>
        <img src={file.previewUrl} alt="" />
        <strong>{file.name}</strong>
      </button>
      <div className="panorama-order-actions">
        <Button variant="ghost" size="icon" aria-label={`上移 ${file.name}`} disabled={disabled || index === 0} onClick={() => onMove(index, -1)}><ArrowLeft /></Button>
        <Button variant="ghost" size="icon" aria-label={`下移 ${file.name}`} disabled={disabled || index === files.length - 1} onClick={() => onMove(index, 1)}><ArrowRight /></Button>
        <Button variant="ghost" size="icon" aria-label={`删除 ${file.name}`} disabled={disabled} onClick={() => onRemove(index)}><X /></Button>
      </div>
    </div>)}
  </div>;
}
