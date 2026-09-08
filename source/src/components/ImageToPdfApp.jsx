import { useCallback, useState } from 'react';
import JSZip from 'jszip';
import { Archive, ArrowDown, ArrowUp, Download, ImagePlus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { readImageFile } from '@/lib/imageUtils';
import { createImagePdf, toPdfFileName } from '@/lib/imageToPdf';
import { processConversionBatch } from '@/lib/formatConversion';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function uniqueFileName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const base = name.replace(/\.pdf$/i, '');
  let number = 2;
  while (usedNames.has(`${base}-${number}.pdf`)) number += 1;
  const next = `${base}-${number}.pdf`;
  usedNames.add(next);
  return next;
}

export default function ImageToPdfApp() {
  const [images, setImages] = useState([]);
  const [processingId, setProcessingId] = useState(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [progress, setProgress] = useState('');

  const addImages = useCallback(async (files) => {
    const accepted = files.filter((file) => ACCEPTED_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name));
    if (!accepted.length) {
      toast.error('请选择 PNG、JPG、JPEG 或 WebP 图片');
      return;
    }
    const loaded = [];
    for (const file of accepted) {
      try {
        loaded.push(await readImageFile(file));
      } catch {
        toast.error(`${file.name} 无法读取`);
      }
    }
    setImages((current) => [...current, ...loaded]);
    if (loaded.length) toast.success(`已添加 ${loaded.length} 张图片`);
  }, []);

  const handleChange = (event) => {
    addImages(Array.from(event.target.files));
    event.target.value = '';
  };

  const moveImage = (index, direction) => {
    setImages((current) => {
      const next = [...current];
      const target = index + direction;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeImage = (index) => {
    setImages((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const clearAll = () => {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setImages([]);
    toast.info('已清除全部图片');
  };

  const downloadOne = async (image) => {
    setProcessingId(image.id);
    try {
      const bytes = await createImagePdf(image);
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), toPdfFileName(image.name));
      toast.success(`${toPdfFileName(image.name)} 已生成`);
    } catch {
      toast.error(`${image.name} 转换失败，请尝试重新添加`);
    } finally {
      setProcessingId(null);
    }
  };

  const downloadAll = async () => {
    setIsBatchProcessing(true);
    const zip = new JSZip();
    const usedNames = new Set();
    try {
      const result = await processConversionBatch(
        images,
        async (image) => ({ image, bytes: await createImagePdf(image) }),
        (_, index, total) => setProgress(`正在转换 ${index + 1} / ${total}`)
      );
      result.successes.forEach(({ result: converted }) => {
        zip.file(uniqueFileName(toPdfFileName(converted.image.name), usedNames), converted.bytes);
      });
      if (!result.successes.length) {
        toast.error(`全部 ${result.failures.length} 张图片转换失败，请检查图片后重试`);
        return;
      }
      setProgress('正在打包下载文件');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      downloadBlob(blob, '图片转PDF.zip');
      toast.success(`已打包 ${result.successes.length} 个独立 PDF${result.failures.length ? `，${result.failures.length} 张失败` : ''}`);
      if (result.failures.length) toast.error(`转换失败：${result.failures.map(({ item }) => item.name).join('、')}`);
    } catch {
      toast.error('批量转换失败，请检查图片后重试');
    } finally {
      setIsBatchProcessing(false);
      setProgress('');
    }
  };

  return (
    <div className="tool-page">
      <div className="page-intro">
        <div>
          <h1>图片转 PDF</h1>
        </div>
        {images.length > 0 && <div className="intro-stat"><strong>{images.length}</strong><span>个 PDF 待生成</span></div>}
      </div>

      <Card className="upload-card">
        <div
          className="upload-dropzone"
          onClick={() => document.getElementById('image-to-pdf-input').click()}
          onDrop={(event) => {
            event.preventDefault();
            addImages(Array.from(event.dataTransfer.files));
          }}
          onDragOver={(event) => event.preventDefault()}
        >
          <ImagePlus className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">点击或拖拽添加图片</p>
          <p className="mt-1 text-xs text-muted-foreground">支持 PNG、JPG、JPEG、WebP，可一次选择多张</p>
          <input
            id="image-to-pdf-input"
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleChange}
          />
        </div>
      </Card>

      {images.length > 0 && (
        <>
          <Card className="image-pdf-list">
            <div className="image-pdf-list-head">
              <div>
                <h2>待转换图片</h2>
                <p>每一项都会生成一个同名 PDF 文件</p>
              </div>
              <Button variant="outline" size="sm" onClick={clearAll} className="text-destructive">
                <Trash2 className="mr-1 h-4 w-4" />清除全部
              </Button>
            </div>
            <div className="image-pdf-grid">
              {images.map((image, index) => (
                <article key={image.id} className="image-pdf-item">
                  <img src={image.previewUrl} alt={image.name} />
                  <div className="image-pdf-info">
                    <strong title={image.name}>{image.name}</strong>
                    <span>{image.width} × {image.height}</span>
                    <small>将生成：{toPdfFileName(image.name)}</small>
                  </div>
                  <div className="image-pdf-actions">
                    <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => moveImage(index, -1)} aria-label="向前移动">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)} aria-label="向后移动">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => downloadOne(image)} disabled={processingId === image.id || isBatchProcessing}>
                      <Download className="mr-1 h-4 w-4" />{processingId === image.id ? '转换中…' : '下载 PDF'}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeImage(index)} aria-label="移除图片">
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </Card>

          <Card className="export-panel">
            <div>
              <h3 className="font-medium">批量生成独立 PDF</h3>
              <p className="mt-1 text-xs text-muted-foreground">{progress || `${images.length} 张图片将生成 ${images.length} 个 PDF`}</p>
            </div>
            <Button onClick={downloadAll} disabled={isBatchProcessing}>
              <Archive className="mr-2 h-4 w-4" />{isBatchProcessing ? '正在生成…' : '打包下载 ZIP'}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
