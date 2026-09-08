import { Button } from '@/components/ui/button';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { getPanoramaDrawRect, getPanoramaPreviewScale, quantizePanoramaRegions } from '@/lib/imageUtils';

export default function ImageMergePreview({ files, layout, selectedId, onSelect, zoom, onZoom, disabled = false }) {
  if (!files.length) return <div className="panorama-empty">添加至少两张图片后显示完整全景预览</div>;
  const quantized = quantizePanoramaRegions(layout.items);
  const displayScale = getPanoramaPreviewScale(layout.width, quantized.height, zoom);
  return <section className="panorama-preview-panel" aria-label="拼接全景预览">
    <div className="panorama-preview-toolbar"><span>{layout.width} × {quantized.height} px</span><div><Button disabled={disabled} size="icon" variant="outline" onClick={() => onZoom(Math.max(.1, zoom - .1))} aria-label="缩小预览"><Minus /></Button><Button disabled={disabled} size="icon" variant="outline" onClick={() => onZoom(Math.min(1, zoom + .1))} aria-label="放大预览"><Plus /></Button><Button disabled={disabled} size="sm" variant="outline" onClick={() => onZoom(.28)}><Maximize2 />适应窗口</Button></div></div>
    <div className="panorama-scroll"><div className="panorama-canvas" style={{ width: layout.width * displayScale, height: quantized.height * displayScale }}>
      {files.map((file, index) => { const region = quantized.regions[index]; const item = { ...layout.items[index], regionHeight: region.height }; const rect = getPanoramaDrawRect(file, item, layout.width, region.y); const scaleX = layout.width * displayScale / rect.sw; const scaleY = region.height * displayScale / rect.sh; return <button disabled={disabled} type="button" key={file.id} className={`panorama-region ${selectedId === file.id ? 'selected' : ''}`} style={{ height: region.height * displayScale }} onClick={() => onSelect(file.id)} aria-label={`选择 ${file.name}`}><img src={file.previewUrl} alt="" style={{ width: file.width * scaleX, height: file.height * scaleY, left: -rect.sx * scaleX, top: -rect.sy * scaleY }} /></button>; })}
    </div></div>
  </section>;
}
