import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from '@/lib/pdfLoader';
import {
  Copy, Download, FileScan, ImagePlus, Minus, Plus, Redo2, Save, ScanText, Stamp,
  Trash2, Type, Undo2, Upload, X, ZoomIn, ZoomOut, Maximize2, Square,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import PdfEditorCanvas from './pdf-editor/PdfEditorCanvas';
import { cancelOcr, recognizeCanvas } from '@/lib/localOcr';
import { createEditorPage, parsePageRange, pushHistory } from '@/lib/pdfEditorModel';
import { exportEditedPdf } from '@/lib/pdfEditorExport';
import { convertWordToPdf } from '@/lib/pdfUtils';
import {
  calculateSeamSliceWidthPercent,
  clampObjectPosition,
  copyStamp,
  createSeamStampLayout,
  createSeamGroupLayouts,
  createStampObject,
  createVerticalStampSlices,
  getStampBatchSizeLimit,
  insertSeamStampObjects,
  isSupportedEditorFile,
  makeStampTransparent,
  moveSeamStampGroup,
  parseStampSizeDraft,
  resizeStampFromCorner,
  resizeStampImage,
  updateStampOnPage,
  updateStampBatchSize,
  validateSeamPageRange,
} from '@/lib/stampUtils';


const clone = (value) => JSON.parse(JSON.stringify(value));
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function textObject(text = '双击修改文字') {
  return {
    id: makeId(), type: 'text', text, x: 12, y: 12, width: 32, height: 7,
    fontSize: 18, color: '#111827', align: 'left', rotation: 0, opacity: 1,
    coverOriginal: false, coverColor: '#ffffff', confidence: 100,
  };
}

export default function PdfEditorApp() {
  const [pdf, setPdf] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileName, setFileName] = useState('');
  const [pageStates, setPageStates] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [stampSizeDraft, setStampSizeDraft] = useState('');
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pageRange, setPageRange] = useState('全部');
  const [watermarkText, setWatermarkText] = useState('机密文件');
  const [watermarkSize, setWatermarkSize] = useState(24);
  const [watermarkOpacity, setWatermarkOpacity] = useState(50);
  const [watermarkColor, setWatermarkColor] = useState('#111827');
  const [watermarkPosition, setWatermarkPosition] = useState('bottom-right');
  const [watermarkTiled, setWatermarkTiled] = useState(false);
  const [watermarkRotation, setWatermarkRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [redactionMode, setRedactionMode] = useState(false);
  const [redactionColor, setRedactionColor] = useState('#000000');
  const [pendingStampCount, setPendingStampCount] = useState(0);
  const [pendingStampStrengths, setPendingStampStrengths] = useState({});
  const [showStampPanel, setShowStampPanel] = useState(false);
  const [isApplyingStamp, setIsApplyingStamp] = useState(false);
  const [stampHeight, setStampHeight] = useState(24);
  const [stampOpacity, setStampOpacity] = useState(90);
  const [stampStrength, setStampStrength] = useState(60);
  const [seamEnabled, setSeamEnabled] = useState(false);
  const [seamStartPage, setSeamStartPage] = useState(1);
  const [seamEndPage, setSeamEndPage] = useState(2);
  const [seamGroupCount, setSeamGroupCount] = useState(1);
  const [seamTop, setSeamTop] = useState(8);
  const [seamBottom, setSeamBottom] = useState(8);
  const [seamSide, setSeamSide] = useState('right');
  const [isDraggingDocument, setIsDraggingDocument] = useState(false);
  const dragDepthRef = useRef(0);
  const canvasRef = useRef(null);
  const pageStatesRef = useRef([]);
  const pageNumberRef = useRef(1);
  const documentIdentityRef = useRef(0);
  const stampJobsRef = useRef(new Map());
  const rangeGestureRef = useRef(false);

  const cancelStampJob = (stampId) => {
    const job = stampJobsRef.current.get(stampId);
    if (!job) return;
    clearTimeout(job.timer);
    job.cancelled = true;
    stampJobsRef.current.delete(stampId);
    setPendingStampCount((count) => Math.max(0, count - 1));
    setPendingStampStrengths((current) => {
      const next = { ...current };
      delete next[stampId];
      return next;
    });
  };

  const cancelAllStampJobs = (updateState = true) => {
    stampJobsRef.current.forEach((job) => {
      clearTimeout(job.timer);
      job.cancelled = true;
    });
    stampJobsRef.current.clear();
    if (updateState) {
      setPendingStampCount(0);
      setPendingStampStrengths({});
    }
  };

  useEffect(() => {
    pageStatesRef.current = pageStates;
  }, [pageStates]);

  useEffect(() => {
    pageNumberRef.current = pageNumber;
  }, [pageNumber]);

  useEffect(() => () => cancelAllStampJobs(false), []);

  useEffect(() => () => {
    pdf?.destroy();
    cancelOcr();
  }, [pdf]);

  const pageState = pageStates[pageNumber - 1];
  const selected = useMemo(
    () => pageState?.objects.find((object) => object.id === selectedId),
    [pageState, selectedId]
  );

  useEffect(() => {
    setStampSizeDraft(selected?.type === 'stamp' ? String(Math.round(selected.height)) : '');
  }, [selected?.id, selected?.height, selected?.type]);

  const commit = (nextStates, previousStates = pageStatesRef.current) => {
    setHistory((current) => pushHistory(current, clone(previousStates)));
    setFuture([]);
    pageStatesRef.current = nextStates;
    setPageStates(nextStates);
  };

  const updatePage = (updater, saveHistory = true) => {
    const current = pageStatesRef.current;
    const next = [...current];
    next[pageNumberRef.current - 1] = updater(current[pageNumberRef.current - 1]);
    if (saveHistory) commit(next, current);
    else {
      pageStatesRef.current = next;
      setPageStates(next);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!isSupportedEditorFile(file)) {
      toast.error('请选择 PDF 或 DOCX 文件');
      return;
    }
    cancelAllStampJobs();
    const documentIdentity = ++documentIdentityRef.current;
    setLoadingFile(true);
    try {
      const isWord = /\.docx$/i.test(file.name);
      const converted = isWord ? await convertWordToPdf(file) : null;
      const bytes = converted?.bytes || await file.arrayBuffer();
      const loaded = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
      if (documentIdentityRef.current !== documentIdentity) {
        loaded.destroy();
        return;
      }
      setPdf(loaded);
      setFileName((converted?.name || file.name).replace(/\.pdf$/i, '-已编辑.pdf'));
      const initialPages = Array.from({ length: loaded.numPages }, createEditorPage);
      pageStatesRef.current = initialPages;
      setPageStates(initialPages);
      setPageNumber(1);
      pageNumberRef.current = 1;
      setHistory([]);
      setFuture([]);
      setSelectedId(null);
      setZoom(1);
      setSeamStartPage(1);
      setSeamEndPage(loaded.numPages);
      toast.success(`${isWord ? 'Word 已转为 PDF，' : ''}已打开 ${file.name}，共 ${loaded.numPages} 页`);
    } catch {
      toast.error('文件无法打开，请检查 PDF 是否损坏、受密码保护，或 Word 文件格式是否为 DOCX');
    } finally {
      if (documentIdentityRef.current === documentIdentity) setLoadingFile(false);
    }
  };

  const documentDropHandlers = {
    onDragEnter: (event) => {
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingDocument(true);
    },
    onDragOver: (event) => event.preventDefault(),
    onDragLeave: (event) => {
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (!dragDepthRef.current) setIsDraggingDocument(false);
    },
    onDrop: (event) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingDocument(false);
      const file = [...event.dataTransfer.files].find(isSupportedEditorFile);
      if (file) handleFile(file);
      else toast.error('请拖入 PDF 或 DOCX 文件');
    },
  };

  const clearDocument = () => {
    if (!window.confirm('确定清空当前文件并返回上传页面吗？')) return;
    cancelAllStampJobs();
    documentIdentityRef.current += 1;
    cancelOcr();
    pdf?.destroy();
    setPdf(null);
    setFileName('');
    pageStatesRef.current = [];
    setPageStates([]);
    setSelectedId(null);
    setHistory([]);
    setFuture([]);
    setOcrProgress(null);
    setRedactionMode(false);
  };

  const addText = () => {
    const object = textObject();
    updatePage((state) => ({ ...state, objects: [...state.objects, object] }));
    setSelectedId(object.id);
  };

  const addImage = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const object = {
        id: makeId(), type: 'image', src: reader.result, x: 15, y: 15,
        width: 35, height: 25, rotation: 0, opacity: 1,
      };
      updatePage((state) => ({ ...state, objects: [...state.objects, object] }));
      setSelectedId(object.id);
    };
    reader.readAsDataURL(file);
  };

  const applyStamp = async (file) => {
    if (!file || isApplyingStamp) return;
    const range = seamEnabled
      ? validateSeamPageRange(seamStartPage, seamEndPage, pdf.numPages)
      : null;
    if (range && !range.valid) {
      toast.error(range.error);
      return;
    }
    let groups = [];
    try {
      if (seamEnabled) groups = createSeamGroupLayouts({
        groupCount: seamGroupCount,
        height: stampHeight,
        top: seamTop,
        bottom: seamBottom,
      });
    } catch (error) {
      toast.error(error.message);
      return;
    }
    const documentIdentity = documentIdentityRef.current;
    const targetPage = pageNumberRef.current;
    setIsApplyingStamp(true);
    try {
      const fileDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const resized = await resizeStampImage(fileDataUrl, 1600);
      const transparentSrc = await makeStampTransparent(resized.src, stampStrength);
      const slices = seamEnabled
        ? await createVerticalStampSlices(transparentSrc, range.pages.length)
        : [];
      if (documentIdentityRef.current !== documentIdentity) return;
      const batchId = `stamp-batch-${makeId()}`;
      const targetPageData = await pdf.getPage(targetPage);
      const targetViewport = targetPageData.getViewport({ scale: 1 });
      const pageAspectRatio = targetViewport.width / targetViewport.height;
      const ordinaryWidth = calculateSeamSliceWidthPercent({
        heightPercent: stampHeight,
        pageAspectRatio,
        stampAspectRatio: resized.imageAspectRatio,
        sliceCount: 1,
      });
      const ordinary = {
        ...createStampObject(resized.src, transparentSrc, {
          id: `${batchId}-ordinary`,
          x: 32,
          y: 38,
          width: ordinaryWidth,
          height: stampHeight,
          opacity: stampOpacity / 100,
          imageAspectRatio: resized.imageAspectRatio,
          whiteRemovalStrength: stampStrength,
        }),
        pageNumber: targetPage,
        stampBatchId: batchId,
      };
      const seamPageAspects = new Map();
      if (seamEnabled) {
        await Promise.all(range.pages.map(async (pageNumber) => {
          const target = await pdf.getPage(pageNumber);
          const viewport = target.getViewport({ scale: 1 });
          seamPageAspects.set(pageNumber, viewport.width / viewport.height);
        }));
      }
      if (documentIdentityRef.current !== documentIdentity) return;
      const seamObjects = groups.flatMap((group) => {
        const groupId = `${batchId}-seam-${group.groupIndex}`;
        return createSeamStampLayout(range.pages, {
          top: group.top,
          height: stampHeight,
          width: 1,
          opacity: stampOpacity / 100,
          groupId,
          side: seamSide,
        }).map((item, index) => ({
          ...createStampObject('', slices[index].src, {
            id: `${groupId}-${index}`,
            x: (item.seamSide === 'left' ? 0 : 100) - calculateSeamSliceWidthPercent({
              heightPercent: stampHeight,
              pageAspectRatio: seamPageAspects.get(item.pageNumber),
              stampAspectRatio: slices[index].imageAspectRatio,
              sliceCount: 1,
            }) / 2,
            y: item.y,
            width: calculateSeamSliceWidthPercent({
              heightPercent: stampHeight,
              pageAspectRatio: seamPageAspects.get(item.pageNumber),
              stampAspectRatio: slices[index].imageAspectRatio,
              sliceCount: 1,
            }),
            height: item.height,
            opacity: item.opacity,
            imageAspectRatio: slices[index].imageAspectRatio,
            whiteRemovalStrength: stampStrength,
          }),
          pageNumber: item.pageNumber,
          stampBatchId: batchId,
          seamStamp: true,
          seamGroupId: item.seamGroupId,
          seamSide: item.seamSide,
          sliceIndex: item.sliceIndex,
          sliceCount: item.sliceCount,
        }));
      });
      const current = pageStatesRef.current;
      const next = insertSeamStampObjects(current, [ordinary, ...seamObjects]);
      commit(next, current);
      setSelectedId(pageNumberRef.current === targetPage ? ordinary.id : null);
      toast.success(seamEnabled
        ? `普通签章及 ${groups.length} 组骑缝章已一次应用`
        : '普通签章已应用，可拖动到需要的位置');
    } catch {
      toast.error('印章处理失败，未修改文档，请重新选择图片');
    } finally {
      setIsApplyingStamp(false);
    }
  };

  const changeStampStrength = (object, strength) => {
    setPendingStampStrengths((current) => ({ ...current, [object.id]: strength }));
    const previousJob = stampJobsRef.current.get(object.id);
    if (previousJob) {
      clearTimeout(previousJob.timer);
      previousJob.cancelled = true;
    } else {
      setPendingStampCount((count) => count + 1);
    }
    const documentIdentity = documentIdentityRef.current;
    const targetPageIndex = pageNumberRef.current - 1;
    const job = { cancelled: false, timer: null };
    stampJobsRef.current.set(object.id, job);
    job.timer = setTimeout(async () => {
      try {
        const src = await makeStampTransparent(object.originalSrc, strength);
        if (
          job.cancelled
          || stampJobsRef.current.get(object.id) !== job
          || documentIdentityRef.current !== documentIdentity
        ) return;
        const next = updateStampOnPage(
          pageStatesRef.current,
          targetPageIndex,
          object.id,
          { src, whiteRemovalStrength: strength }
        );
        pageStatesRef.current = next;
        setPageStates(next);
      } catch {
        if (!job.cancelled && stampJobsRef.current.get(object.id) === job) {
          toast.error('印章去白处理失败，请重新上传图片');
        }
      } finally {
        if (stampJobsRef.current.get(object.id) === job) {
          stampJobsRef.current.delete(object.id);
          setPendingStampCount((count) => Math.max(0, count - 1));
          setPendingStampStrengths((current) => {
            const next = { ...current };
            delete next[object.id];
            return next;
          });
        }
      }
    }, 180);
  };

  const changeObject = (id, patch, saveHistory = true) => {
    updatePage((state) => ({
      ...state,
      objects: state.objects.map((object) => object.id === id ? { ...object, ...patch } : object),
    }), saveHistory);
  };

  const changeStampSize = (object, requestedHeight, saveHistory = false) => {
    const limit = getStampBatchSizeLimit(pageStatesRef.current, object.stampBatchId);
    const height = Math.max(5, Math.min(limit, Number(requestedHeight) || 5));
    const current = pageStatesRef.current;
    if (object.stampBatchId) {
      try {
        const next = updateStampBatchSize(current, object.stampBatchId, height);
        if (saveHistory) commit(next, current);
        else {
          pageStatesRef.current = next;
          setPageStates(next);
        }
      } catch (error) {
        toast.error(error.message);
      }
      return;
    }
    const width = object.height > 0 ? object.width * height / object.height : object.width;
    const next = updateStampOnPage(current, pageNumberRef.current - 1, object.id, {
      width,
      height,
      ...clampObjectPosition({ x: object.x, y: object.y, width, height }),
    });
    if (saveHistory) commit(next, current);
    else {
      pageStatesRef.current = next;
      setPageStates(next);
    }
  };

  const resizeStampFromCanvas = (object, corner, pointer) => {
    const geometry = resizeStampFromCorner(
      object,
      corner,
      pointer,
      5,
      getStampBatchSizeLimit(pageStatesRef.current, object.stampBatchId)
    );
    const current = pageStatesRef.current;
    let next = object.stampBatchId
      ? updateStampBatchSize(current, object.stampBatchId, geometry.height)
      : current;
    next = updateStampOnPage(next, pageNumberRef.current - 1, object.id, geometry);
    pageStatesRef.current = next;
    setPageStates(next);
  };

  const copySelectedStamp = () => {
    if (!selected || selected.type !== 'stamp') return;
    if (!selected.seamStamp && (pendingStampStrengths[selected.id] !== undefined || stampJobsRef.current.has(selected.id))) {
      toast.error('印章去白处理中，请稍后再复制');
      return;
    }
    const current = pageStatesRef.current;
    const batchId = `stamp-batch-${makeId()}`;
    const groupSlices = selected.seamStamp
      ? current.flatMap((page) => page.objects).filter((object) => object.seamGroupId === selected.seamGroupId)
      : [];
    try {
      const result = copyStamp(current, pageNumberRef.current - 1, selected.id, selected.seamStamp
        ? {
          objectIds: groupSlices.map(() => makeId()),
          batchId,
          seamGroupId: `${batchId}-seam-0`,
          offset: 5,
        }
        : { objectId: makeId(), batchId, offset: 5 });
      commit(result.pageStates, current);
      setSelectedId(result.selectedId);
      toast.success(selected.seamStamp ? '已复制整组骑缝章' : '已复制签章');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const commitStampSizeDraft = (object, draft = stampSizeDraft) => {
    const value = parseStampSizeDraft(
      draft,
      getStampBatchSizeLimit(pageStatesRef.current, object.stampBatchId)
    );
    if (value === null || value === object.height) {
      setStampSizeDraft(String(Math.round(object.height)));
      return;
    }
    changeStampSize(object, value, true);
  };

  const moveSeamGroup = (groupId, y, saveHistory = false) => {
    const current = pageStatesRef.current;
    const next = moveSeamStampGroup(current, groupId, y);
    if (saveHistory) commit(next, current);
    else {
      pageStatesRef.current = next;
      setPageStates(next);
    }
  };

  const goToPage = (nextPage) => {
    pageNumberRef.current = nextPage;
    setPageNumber(nextPage);
    setSelectedId(null);
  };

  const beginObjectChange = () => {
    setHistory((current) => pushHistory(current, clone(pageStatesRef.current)));
    setFuture([]);
  };

  const beginStampRangeGesture = () => {
    if (rangeGestureRef.current) return;
    rangeGestureRef.current = true;
    beginObjectChange();
  };

  const endStampRangeGesture = () => {
    rangeGestureRef.current = false;
  };

  const stampRangeHandlers = {
    onPointerDown: beginStampRangeGesture,
    onPointerUp: endStampRangeGesture,
    onPointerCancel: endStampRangeGesture,
    onKeyDown: (event) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
        beginStampRangeGesture();
      }
    },
    onKeyUp: endStampRangeGesture,
    onBlur: endStampRangeGesture,
  };

  const addRedaction = (object) => {
    updatePage((state) => ({ ...state, objects: [...state.objects, object] }));
    setSelectedId(object.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    cancelStampJob(selectedId);
    updatePage((state) => ({ ...state, objects: state.objects.filter((object) => object.id !== selectedId) }));
    setSelectedId(null);
  };

  const undo = () => {
    if (!history.length) return;
    cancelAllStampJobs();
    setFuture((current) => [clone(pageStates), ...current]);
    pageStatesRef.current = history[history.length - 1];
    setPageStates(history[history.length - 1]);
    setHistory((current) => current.slice(0, -1));
    setSelectedId(null);
  };

  const redo = () => {
    if (!future.length) return;
    cancelAllStampJobs();
    setHistory((current) => pushHistory(current, clone(pageStates)));
    pageStatesRef.current = future[0];
    setPageStates(future[0]);
    setFuture((current) => current.slice(1));
    setSelectedId(null);
  };

  const runOcr = async () => {
    if (!canvasRef.current || canvasRef.current.dataset.ready !== 'true') return toast.info('页面正在加载，请稍后识别');
    const identity = documentIdentityRef.current;
    const targetPage = pageNumberRef.current - 1;
    const sourceCanvas = canvasRef.current;
    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;
    const textScale = Number(sourceCanvas.dataset.textScale) || 1;
    setOcrProgress(0);
    try {
      const result = await recognizeCanvas(sourceCanvas, setOcrProgress);
      if (identity !== documentIdentityRef.current) return;
      if (!result.text.trim()) { toast.info('这一页未识别到文字'); return; }
      const canvas = { width: sourceWidth, height: sourceHeight };
      const recognized = result.words.length ? result.words.map((word) => ({
        ...textObject(word.text),
        x: (word.bbox.x0 / canvas.width) * 100,
        y: (word.bbox.y0 / canvas.height) * 100,
        width: Math.max(4, ((word.bbox.x1 - word.bbox.x0) / canvas.width) * 100),
        height: Math.max(2, ((word.bbox.y1 - word.bbox.y0) / canvas.height) * 100),
        fontSize: Math.max(8, (word.bbox.y1 - word.bbox.y0) / textScale),
        coverOriginal: true,
        confidence: word.confidence,
      })) : [{
        ...textObject(result.text.trim() || '未识别到文字'),
        x: 8, y: 8, width: 84, height: 25, coverOriginal: true,
      }];
      const next = [...pageStatesRef.current];
      const state = next[targetPage];
      next[targetPage] = {
        ...state,
        objects: [...state.objects, ...recognized],
        ocrWords: recognized.map((object) => ({
          text: object.text, x: object.x, y: object.y, fontSize: object.fontSize,
        })),
      };
      commit(next);
      toast.success(`OCR 完成，识别到 ${recognized.length} 个文字区域`);
    } catch (error) {
      if (error.name !== 'AbortError') toast.error('OCR 未完成。首次使用需要下载识别模型，请检查网络后重试');
    } finally {
      setOcrProgress(null);
    }
  };

  const applyWatermark = () => {
    if (!watermarkText.trim()) {
      toast.error('请输入水印文字');
      return;
    }
    const pages = parsePageRange(pageRange, pdf.numPages);
    if (!pages.length) {
      toast.error('页面范围无效，请输入“全部”或类似 1,3-5 的范围');
      return;
    }
    const next = clone(pageStates);
    const positionMap = {
      'top-left': { x: 6, y: 6, width: 42, align: 'left' },
      'top-center': { x: 15, y: 6, width: 70, align: 'center' },
      'top-right': { x: 52, y: 6, width: 42, align: 'right' },
      center: { x: 15, y: 46, width: 70, align: 'center' },
      'bottom-left': { x: 6, y: 89, width: 42, align: 'left' },
      'bottom-center': { x: 15, y: 89, width: 70, align: 'center' },
      'bottom-right': { x: 52, y: 89, width: 42, align: 'right' },
    };
    const createWatermark = (position) => ({
      ...textObject(watermarkText.trim()),
      ...position,
      height: 7,
      fontSize: watermarkSize,
      color: watermarkColor,
      opacity: watermarkOpacity / 100,
      rotation: watermarkRotation,
      watermark: true,
    });

    pages.forEach((targetPage) => {
      const objects = watermarkTiled
        ? [12, 38, 64, 88].flatMap((y) => [8, 38, 68].map((x) => createWatermark({
            x, y, width: 26, align: 'center',
          })))
        : [createWatermark(positionMap[watermarkPosition])];
      next[targetPage - 1].objects.push(...objects);
    });
    commit(next);
    toast.success(`水印已应用到 ${pages.length} 页`);
  };

  const clearWatermarks = () => {
    const pages = parsePageRange(pageRange, pdf.numPages);
    const next = clone(pageStates);
    pages.forEach((targetPage) => {
      next[targetPage - 1].objects = next[targetPage - 1].objects.filter((object) => !object.watermark);
    });
    commit(next);
    toast.success(`已清除 ${pages.length} 页中的水印`);
  };

  const exportPdf = async () => {
    if (pendingStampCount > 0 || isApplyingStamp) {
      toast.info('印章正在处理，请稍候再导出');
      return;
    }
    setIsExporting(true);
    try {
      const result = await exportEditedPdf(pdf, pageStates, fileName);
      const blob = new Blob([result.bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('编辑后的 PDF 已生成');
    } catch (error) {
      console.error(error);
      toast.error('PDF 导出失败，请减少页面数量后重试');
    } finally {
      setIsExporting(false);
    }
  };

  if (!pdf) {
    return (
      <div className={`tool-page document-drop-surface ${isDraggingDocument ? 'dragging' : ''}`} {...documentDropHandlers}>
        <div className="page-intro">
          <div>
            <h1>PDF 文档工作台</h1>
          </div>
        </div>
        <Card className="upload-card">
          <label className="upload-dropzone block">
            <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium" role="status">{loadingFile ? '正在打开文件…' : '选择需要编辑的 PDF 或 DOCX'}</p>
            <p className="mt-1 text-xs text-muted-foreground">文件只在本机处理，不会上传服务器</p>
            <input type="file" aria-label="选择需要编辑的 PDF 或 DOCX" disabled={loadingFile} accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { handleFile(event.target.files[0]); event.target.value = ''; }} />
          </label>
        </Card>
      </div>
    );
  }

  return (
    <div className={`pdf-editor-page document-drop-surface ${isDraggingDocument ? 'dragging' : ''}`} {...documentDropHandlers}>
      <header className="editor-commandbar">
        <div className="editor-file">
          <FileScan /><span><strong>PDF 文档工作台</strong><small>{fileName}</small></span>
          <Button variant="ghost" size="sm" onClick={clearDocument}>清空文件</Button>
        </div>
        <div className="editor-tools">
          <Button variant="ghost" size="sm" onClick={addText}><Type />添加文字</Button>
          <label className="editor-tool-label"><ImagePlus />添加图片<input type="file" accept="image/*" onChange={(event) => addImage(event.target.files[0])} /></label>
          <Button variant={showStampPanel ? 'default' : 'ghost'} size="sm" onClick={() => setShowStampPanel((value) => !value)}><Stamp />电子签章</Button>
          <Button variant="ghost" size="sm" onClick={runOcr} disabled={ocrProgress !== null}><ScanText />{ocrProgress === null ? 'OCR 识别' : `${ocrProgress}%`}</Button>
          <Button
            variant={redactionMode ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setRedactionMode((value) => !value)}
            aria-pressed={redactionMode}
          ><Square />页面打码</Button>
          {ocrProgress !== null && <Button variant="ghost" size="sm" onClick={cancelOcr}><X />取消</Button>}
          <div className="editor-zoom" aria-label="页面缩放">
            <Button variant="ghost" size="icon" onClick={() => setZoom((value) => Math.max(.5, value - .25))} disabled={zoom <= .5} aria-label="缩小页面"><ZoomOut /></Button>
            <span>{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" onClick={() => setZoom((value) => Math.min(2, value + .25))} disabled={zoom >= 2} aria-label="放大页面"><ZoomIn /></Button>
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)} aria-label="适合页面"><Maximize2 />适合页面</Button>
          </div>
          <Button variant="ghost" size="sm" onClick={undo} disabled={!history.length}><Undo2 />撤销</Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={!future.length}><Redo2 />重做</Button>
          <Button variant="ghost" size="sm" onClick={deleteSelected} disabled={!selectedId}><Trash2 />删除对象</Button>
        </div>
        <Button onClick={exportPdf} disabled={isExporting || pendingStampCount > 0 || isApplyingStamp}>
          <Save />{isExporting ? '正在导出…' : pendingStampCount > 0 || isApplyingStamp ? '正在处理印章…' : '导出 PDF'}
        </Button>
      </header>

      <div className="pdf-editor-layout">
        <aside className="editor-pages">
          {pageStates.map((_, index) => (
            <button key={index} type="button" className={pageNumber === index + 1 ? 'active' : ''} onClick={() => goToPage(index + 1)}>
              <span>{index + 1}</span><small>第 {index + 1} 页</small>
            </button>
          ))}
        </aside>

        <main className="editor-center">
          <PdfEditorCanvas
            pdf={pdf}
            pageNumber={pageNumber}
            pageState={pageState}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChangeObject={changeObject}
            onBeginObjectChange={beginObjectChange}
            onMoveSeamGroup={moveSeamGroup}
            onResizeStamp={resizeStampFromCanvas}
            canvasRef={canvasRef}
            zoom={zoom}
            redactionMode={redactionMode}
            redactionColor={redactionColor}
            onAddRedaction={addRedaction}
          />
          <div className="editor-page-nav">
            <Button variant="outline" size="sm" disabled={pageNumber === 1} onClick={() => goToPage(pageNumber - 1)}>上一页</Button>
            <span>第 {pageNumber} / {pdf.numPages} 页</span>
            <Button variant="outline" size="sm" disabled={pageNumber === pdf.numPages} onClick={() => goToPage(pageNumber + 1)}>下一页</Button>
          </div>
        </main>

        <aside className="editor-properties">
          {showStampPanel && (
            <section className="seam-stamp-panel">
              <h3><Stamp />电子签章设置</h3>
              <label>印章大小<span>{stampHeight}%</span><input type="range" min="10" max="45" value={stampHeight} onChange={(event) => setStampHeight(Number(event.target.value))} /></label>
              <label>透明度<span>{stampOpacity}%</span><input type="range" min="20" max="100" value={stampOpacity} onChange={(event) => setStampOpacity(Number(event.target.value))} /></label>
              <label>去白强度<span>{stampStrength}%</span><input type="range" min="0" max="100" value={stampStrength} onChange={(event) => setStampStrength(Number(event.target.value))} /></label>
              <label className="watermark-check">
                <input type="checkbox" checked={seamEnabled} onChange={(event) => setSeamEnabled(event.target.checked)} />
                同时启用骑缝章
              </label>
              {seamEnabled && <div className="unified-seam-options">
                <div className="seam-side-options" role="group" aria-label="骑缝章位置">
                  <Button type="button" variant={seamSide === 'left' ? 'default' : 'outline'} size="sm" onClick={() => setSeamSide('left')}>左侧</Button>
                  <Button type="button" variant={seamSide === 'right' ? 'default' : 'outline'} size="sm" onClick={() => setSeamSide('right')}>右侧</Button>
                </div>
                <div className="seam-page-range">
                  <label>开始页<Input type="number" min="1" max={pdf.numPages} value={seamStartPage} onChange={(event) => setSeamStartPage(Number(event.target.value))} /></label>
                  <label>结束页<Input type="number" min="2" max={pdf.numPages} value={seamEndPage} onChange={(event) => setSeamEndPage(Number(event.target.value))} /></label>
                </div>
                <label>骑缝章数量<span>{seamGroupCount}组</span><input type="range" min="1" max="3" step="1" value={seamGroupCount} onChange={(event) => setSeamGroupCount(Number(event.target.value))} /></label>
                <label>顶部留白<span>{seamTop}%</span><input type="range" min="0" max="30" value={seamTop} onChange={(event) => setSeamTop(Number(event.target.value))} /></label>
                <label>底部留白<span>{seamBottom}%</span><input type="range" min="0" max="30" value={seamBottom} onChange={(event) => setSeamBottom(Number(event.target.value))} /></label>
              </div>}
              <label className={`seam-stamp-upload ${isApplyingStamp ? 'disabled' : ''}`}>
                {isApplyingStamp ? '正在处理印章…' : '选择印章并应用'}
                <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" disabled={isApplyingStamp} onChange={(event) => { applyStamp(event.target.files[0]); event.target.value = ''; }} />
              </label>
              <p>每次上传都会在当前页生成普通签章；启用后还会同时生成整组骑缝章。</p>
            </section>
          )}
          {selected && (
            <section>
              <h3>{selected.type === 'text' ? '文字属性' : selected.type === 'redaction' ? '打码属性' : selected.type === 'stamp' ? '签章属性' : '图片属性'}</h3>
              {selected.type === 'redaction' && (
                <div className="redaction-colors">
                  <span>遮挡颜色</span>
                  <div>
                    {[
                      ['#000000', '黑色'],
                      ['#ffffff', '白色'],
                    ].map(([color, label]) => (
                      <button
                        key={color}
                        type="button"
                        className={selected.color === color ? 'active' : ''}
                        onClick={() => {
                          setRedactionColor(color);
                          changeObject(selected.id, { color });
                        }}
                      >
                        <i style={{ backgroundColor: color }} />{label}
                      </button>
                    ))}
                  </div>
                  <p>导出后遮挡块会永久写入新的 PDF。</p>
                </div>
              )}
              {selected.type === 'text' && <>
                <label>字号<Input type="number" min="8" max="96" value={selected.fontSize} onChange={(event) => changeObject(selected.id, { fontSize: Number(event.target.value) })} /></label>
                <label>文字颜色<Input type="color" value={selected.color} onChange={(event) => changeObject(selected.id, { color: event.target.value })} /></label>
                <label className="check-row"><input type="checkbox" checked={selected.coverOriginal} onChange={(event) => changeObject(selected.id, { coverOriginal: event.target.checked })} />遮盖原文字</label>
              </>}
              {selected.type === 'stamp' && !selected.seamStamp && (
                <div className="stamp-settings">
                  <label>去白强度<span>{pendingStampStrengths[selected.id] ?? selected.whiteRemovalStrength}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={pendingStampStrengths[selected.id] ?? selected.whiteRemovalStrength}
                      {...stampRangeHandlers}
                      onChange={(event) => changeStampStrength(selected, Number(event.target.value))}
                    />
                  </label>
                  <p>只去除白色和近白色背景，文档内容可从印章空白区域透出。</p>
                </div>
              )}
              {selected.seamStamp && (
                <div className="seam-slice-note">
                  <strong>骑缝章切片 {selected.sliceIndex + 1}/{selected.sliceCount}</strong>
                  <p>切片尺寸和透明度由整组骑缝章设置决定。需要移除时，可使用顶部“删除对象”删除本页切片，或撤销整组操作。</p>
                </div>
              )}
              {selected.type === 'stamp' ? (
                <div className="stamp-size-control">
                  <div className="stamp-size-heading">
                    <span>签章大小（完整高度）</span>
                    <small>上限 {getStampBatchSizeLimit(pageStates, selected.stampBatchId)}%</small>
                  </div>
                  <div className="stamp-size-actions">
                    <Button type="button" variant="outline" size="icon" aria-label="减小签章"
                      disabled={selected.height <= 5}
                      onClick={() => changeStampSize(selected, Math.round(selected.height) - 1, true)}>
                      <Minus />
                    </Button>
                    <Input type="number" min="5"
                      max={getStampBatchSizeLimit(pageStates, selected.stampBatchId)}
                      value={stampSizeDraft} aria-label="签章大小百分比"
                      onChange={(event) => setStampSizeDraft(event.target.value)}
                      onBlur={(event) => commitStampSizeDraft(selected, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        if (event.key === 'Escape') {
                          const currentValue = String(Math.round(selected.height));
                          setStampSizeDraft(currentValue);
                          event.currentTarget.value = currentValue;
                          event.currentTarget.blur();
                        }
                      }} />
                    <span>%</span>
                    <Button type="button" variant="outline" size="icon" aria-label="放大签章"
                      disabled={selected.height >= getStampBatchSizeLimit(pageStates, selected.stampBatchId)}
                      onClick={() => changeStampSize(selected, Math.round(selected.height) + 1, true)}>
                      <Plus />
                    </Button>
                  </div>
                  <input type="range" min="5"
                    max={getStampBatchSizeLimit(pageStates, selected.stampBatchId)}
                    value={selected.height} {...stampRangeHandlers}
                    onChange={(event) => changeStampSize(selected, Number(event.target.value))} />
                  <Button type="button" variant="outline" onClick={copySelectedStamp}
                    disabled={!selected.seamStamp && (pendingStampStrengths[selected.id] !== undefined || stampJobsRef.current.has(selected.id))}>
                    <Copy />{selected.seamStamp ? '复制整组骑缝章' : '复制签章'}
                  </Button>
                </div>
              ) : !selected.seamStamp ? <>
                <label>宽度<span>{Math.round(selected.width)}%</span><input type="range" min="5" max="90" value={selected.width} onChange={(event) => changeObject(selected.id, { width: Number(event.target.value) })} /></label>
                <label>高度<span>{Math.round(selected.height)}%</span><input type="range" min="3" max="90" value={selected.height} onChange={(event) => changeObject(selected.id, { height: Number(event.target.value) })} /></label>
              </> : null}
              {selected.seamStamp && (
                <label>骑缝章上下位置<span>{Math.round(selected.y)}%</span>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, 100 - selected.height)}
                    value={selected.y}
                    {...stampRangeHandlers}
                    onChange={(event) => moveSeamGroup(selected.seamGroupId, Number(event.target.value), false)}
                  />
                </label>
              )}
              {selected.type !== 'redaction' && !selected.seamStamp && <>
                <label>旋转<span>{selected.rotation || 0}°</span><input type="range" min="-180" max="180" value={selected.rotation || 0} {...(selected.type === 'stamp' ? stampRangeHandlers : {})} onChange={(event) => changeObject(selected.id, { rotation: Number(event.target.value) }, selected.type !== 'stamp')} /></label>
                <label>透明度<span>{Math.round((selected.opacity ?? 1) * 100)}%</span><input type="range" min="10" max="100" value={(selected.opacity ?? 1) * 100} {...(selected.type === 'stamp' ? stampRangeHandlers : {})} onChange={(event) => changeObject(selected.id, { opacity: Number(event.target.value) / 100 }, selected.type !== 'stamp')} /></label>
              </>}
            </section>
          )}

          <section className="watermark-panel">
            <h3><Stamp />水印工具</h3>
            <label className="watermark-field">水印文字
              <Input value={watermarkText} onChange={(event) => setWatermarkText(event.target.value)} placeholder="请输入水印内容" />
            </label>
            <label>字体大小<span>{watermarkSize}px</span>
              <input type="range" min="10" max="72" value={watermarkSize} onChange={(event) => setWatermarkSize(Number(event.target.value))} />
            </label>
            <label>透明度<span>{watermarkOpacity}%</span>
              <input type="range" min="10" max="100" value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} />
            </label>
            <div className="watermark-field">
              <span>颜色</span>
              <div className="watermark-colors">
                {['#ffffff', '#111827', '#dc2626', '#facc15', '#2563eb'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={watermarkColor === color ? 'active' : ''}
                    style={{ backgroundColor: color }}
                    onClick={() => setWatermarkColor(color)}
                    aria-label={`选择颜色 ${color}`}
                  />
                ))}
                <Input type="color" value={watermarkColor} onChange={(event) => setWatermarkColor(event.target.value)} aria-label="自定义水印颜色" />
              </div>
            </div>
            <div className="watermark-field">
              <span>位置</span>
              <div className="watermark-positions">
                {[
                  ['top-left', '左上'], ['top-center', '顶部居中'], ['top-right', '右上'],
                  ['center', '居中'], ['bottom-left', '左下'], ['bottom-center', '底部居中'],
                  ['bottom-right', '右下'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={watermarkPosition === value ? 'active' : ''}
                    onClick={() => setWatermarkPosition(value)}
                    disabled={watermarkTiled}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="watermark-check">
              <input type="checkbox" checked={watermarkTiled} onChange={(event) => setWatermarkTiled(event.target.checked)} />
              在整个页面上平铺水印
            </label>
            <label>旋转角度<span>{watermarkRotation}°</span>
              <input type="range" min="-180" max="180" value={watermarkRotation} onChange={(event) => setWatermarkRotation(Number(event.target.value))} />
            </label>
            <label className="watermark-field">页面范围
              <Input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="全部 或 1,3-5" />
            </label>
            <div className="watermark-actions">
              <Button size="sm" onClick={applyWatermark}>应用水印</Button>
              <Button variant="outline" size="sm" onClick={clearWatermarks}>清除水印</Button>
            </div>
          </section>

          <section className="editor-note">
            <h3><Download />导出说明</h3>
            <p>编辑内容会写入新的 PDF，原文件不会被修改。OCR 英文会加入搜索层，识别结果可在画布中继续修改。</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
