import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import ImageUploader from './ImageUploader';
import ImageList from './ImageList';
import ImageMergeSettings from './ImageMergeSettings';
import ImageMergePreview from './ImageMergePreview';
import ImageDirectCropEditor from './ImageDirectCropEditor';
import { createPanoramaLayout, FULL_CROP, mergeImages, readImageFile, updatePanoramaCrop } from '@/lib/imageUtils';

const EMPTY_LAYOUT = { width: 0, height: 0, items: [], regions: [] };

function revokeImages(images) {
  images.forEach((item) => item?.previewUrl && URL.revokeObjectURL(item.previewUrl));
}

export default function ImageMergerApp() {
  const [files, setFiles] = useState([]);
  const [layout, setLayout] = useState(EMPTY_LAYOUT);
  const [selectedId, setSelectedId] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(.28);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const filesRef = useRef([]);
  const layoutRef = useRef(EMPTY_LAYOUT);
  const selectedIdRef = useRef(null);
  const mountedRef = useRef(true);
  const operationRef = useRef(0);
  const operationKindRef = useRef(null);
  const processingRef = useRef(false);
  const croppingRef = useRef(false);

  const commitWorkspace = useCallback((nextFiles, nextLayout, nextSelectedId) => {
    filesRef.current = nextFiles;
    layoutRef.current = nextLayout;
    selectedIdRef.current = nextSelectedId;
    if (!mountedRef.current) return;
    setFiles(nextFiles);
    setLayout(nextLayout);
    setSelectedId(nextSelectedId);
  }, []);

  const finishOperation = useCallback((generation) => {
    if (!mountedRef.current || operationRef.current !== generation) return;
    processingRef.current = false;
    croppingRef.current = false;
    operationKindRef.current = null;
    setIsProcessing(false);
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    operationRef.current += 1;
    processingRef.current = false;
    operationKindRef.current = null;
    revokeImages(filesRef.current);
    filesRef.current = [];
  }, []);

  const replaceFiles = useCallback((nextFiles, nextSelectedId = selectedIdRef.current) => {
    const currentLayout = layoutRef.current;
    const nextLayout = createPanoramaLayout(nextFiles, currentLayout.items, currentLayout.width);
    commitWorkspace(nextFiles, nextLayout, nextSelectedId);
  }, [commitWorkspace]);

  const addFiles = useCallback(async (newFiles) => {
    if (processingRef.current || croppingRef.current || !mountedRef.current) return;
    processingRef.current = true;
    operationKindRef.current = 'read';
    const generation = operationRef.current + 1;
    operationRef.current = generation;
    setIsProcessing(true);
    const loaded = [];
    try {
      for (const file of newFiles) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} 不是支持的图片格式`);
          continue;
        }
        try {
          const image = await readImageFile(file);
          if (!mountedRef.current || operationRef.current !== generation) {
            revokeImages([...loaded, image]);
            return;
          }
          loaded.push(image);
        } catch {
          if (!mountedRef.current || operationRef.current !== generation) {
            revokeImages(loaded);
            return;
          }
          toast.error(`${file.name} 读取失败`);
        }
      }
      if (loaded.length && mountedRef.current && operationRef.current === generation) {
        const nextFiles = [...filesRef.current, ...loaded];
        const currentLayout = layoutRef.current;
        const nextLayout = createPanoramaLayout(nextFiles, currentLayout.items, currentLayout.width);
        const nextSelectedId = selectedIdRef.current || nextFiles[0].id;
        commitWorkspace(nextFiles, nextLayout, nextSelectedId);
      }
    } finally {
      finishOperation(generation);
    }
  }, [commitWorkspace, finishOperation]);

  const moveFile = (index, direction) => {
    if (processingRef.current || croppingRef.current) return;
    const next = [...filesRef.current];
    const targetIndex = index + direction;
    if (!next[index] || !next[targetIndex]) return;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    replaceFiles(next);
  };

  const removeFile = (index) => {
    if (processingRef.current || croppingRef.current) return;
    const currentFiles = filesRef.current;
    const target = currentFiles[index];
    if (!target) return;
    URL.revokeObjectURL(target.previewUrl);
    const next = currentFiles.filter((_, itemIndex) => itemIndex !== index);
    const nextSelectedId = selectedIdRef.current === target.id
      ? next[Math.min(index, next.length - 1)]?.id || null
      : selectedIdRef.current;
    replaceFiles(next, nextSelectedId);
  };

  const clearAllImages = () => {
    if (croppingRef.current) return;
    if (processingRef.current && operationKindRef.current !== 'read') return;
    operationRef.current += 1;
    operationKindRef.current = null;
    processingRef.current = false;
    revokeImages(filesRef.current);
    commitWorkspace([], EMPTY_LAYOUT, null);
    if (mountedRef.current) {
      setIsProcessing(false);
      toast.info('已清除所有图片');
    }
  };

  const merge = async (name, format) => {
    if (processingRef.current || croppingRef.current) return;
    const snapshotFiles = [...filesRef.current];
    if (snapshotFiles.length < 2) return toast.error('至少需要 2 张图片');
    const snapshotLayout = {
      ...layoutRef.current,
      items: layoutRef.current.items.map((item) => ({ ...item })),
      regions: layoutRef.current.regions?.map((region) => ({ ...region })),
    };
    processingRef.current = true;
    operationKindRef.current = 'export';
    const generation = operationRef.current + 1;
    operationRef.current = generation;
    setIsProcessing(true);
    try {
      const blob = await mergeImages(snapshotFiles, format, snapshotLayout);
      if (!mountedRef.current || operationRef.current !== generation) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('图片合并完成');
    } catch (error) {
      if (mountedRef.current && operationRef.current === generation) toast.error(error.message || '合并失败');
    } finally {
      finishOperation(generation);
    }
  };

  const selectFile = (id) => {
    if (processingRef.current || croppingRef.current) return;
    selectedIdRef.current = id;
    setSelectedId(id);
  };

  const changeSelectedCrop = useCallback((crop) => {
    if (processingRef.current) return;
    const nextLayout = updatePanoramaCrop(layoutRef.current, selectedIdRef.current, crop);
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
  }, []);

  const setCropInteraction = useCallback((active) => {
    croppingRef.current = active;
    if (mountedRef.current) setIsCropping(active);
  }, []);

  const selectedFile = useMemo(() => files.find((file) => file.id === selectedId), [files, selectedId]);
  const selectedItem = layout.items.find((item) => item.id === selectedId);
  const workspaceLocked = isProcessing || isCropping;
  if (!files.length) return <div className="panorama-empty-workspace">
    <div><h1>图片拼接工具</h1><p>添加图片后，可直接拖动橙色裁剪框再导出长图</p><ImageUploader disabled={isProcessing} onFilesAdded={addFiles} /></div>
  </div>;
  return <div className="panorama-workbench">
    <header className="panorama-toolbar">
      <div className="panorama-title"><h1>图片拼接</h1><span>{files.length} 张</span></div>
      <ImageUploader compact disabled={workspaceLocked} onFilesAdded={addFiles} />
      <Button variant="outline" disabled={workspaceLocked || !selectedItem} onClick={() => changeSelectedCrop(FULL_CROP)}><RotateCcw />重置裁剪</Button>
      <Button variant="outline" disabled={workspaceLocked || !selectedFile} onClick={() => removeFile(files.findIndex((file) => file.id === selectedId))}><Trash2 />删除当前</Button>
      <ImageMergeSettings count={files.length} onMerge={merge} isProcessing={workspaceLocked} />
    </header>
    <div className="panorama-order-strip-wrap"><ImageList disabled={workspaceLocked} files={files} selectedId={selectedId} onSelect={selectFile} onMove={moveFile} onRemove={removeFile} onClearAll={clearAllImages} /></div>
    <main className="panorama-main">
      {selectedFile && selectedItem && <ImageDirectCropEditor disabled={isProcessing} file={selectedFile} crop={selectedItem.crop} onCommit={changeSelectedCrop} onInteractionChange={setCropInteraction} />}
      <ImageMergePreview disabled={workspaceLocked} files={files} layout={layout} selectedId={selectedId} onSelect={selectFile} zoom={previewZoom} onZoom={setPreviewZoom} />
    </main>
  </div>;
}
