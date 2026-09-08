import { useEffect, useRef, useState } from 'react';
import { createRedactionFromPoints } from '@/lib/pdfEditorModel';
import { clampObjectPosition } from '@/lib/stampUtils';


export default function PdfEditorCanvas({
  pdf,
  pageNumber,
  pageState,
  selectedId,
  onSelect,
  onChangeObject,
  onBeginObjectChange,
  onMoveSeamGroup,
  onResizeStamp,
  canvasRef,
  zoom,
  redactionMode,
  redactionColor,
  onAddRedaction,
}) {
  const stageRef = useRef(null);
  const viewportRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(800);
  const [textScale, setTextScale] = useState(1);
  const pointerCleanupRef = useRef(null);
  const [draftRedaction, setDraftRedaction] = useState(null);
  const [renderError, setRenderError] = useState('');
  useEffect(() => {
    const element = viewportRef.current;
    const observer = new ResizeObserver(() => setAvailableWidth(Math.max(240, element.clientWidth - 24)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    pointerCleanupRef.current?.();
  }, [pageNumber, redactionMode]);

  useEffect(() => {
    let task;
    let cancelled = false;
    async function render() {
      setRenderError('');
      if (canvasRef.current) canvasRef.current.dataset.ready = 'false';
      try {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;
      const original = page.getViewport({ scale: 1 });
      const renderScale = Math.min(1.35, availableWidth / original.width) * zoom;
      const viewport = page.getViewport({ scale: renderScale });
      setTextScale(renderScale / 1.35);
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.aspectRatio = `${viewport.width}/${viewport.height}`;
      canvas.dataset.textScale = String(renderScale / 1.35);
      const context = canvas.getContext('2d', { alpha: false });
      task = page.render({ canvasContext: context, viewport });
      await task.promise;
      if (!cancelled) canvas.dataset.ready = 'true';
      } catch (error) {
        if (!cancelled && error.name !== 'RenderingCancelledException') setRenderError('此页加载失败，请切换页面后重试。');
      }
    }
    render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, canvasRef, zoom, availableWidth]);

  const beginDrag = (event, object) => {
    if (redactionMode) return;
    event.preventDefault();
    pointerCleanupRef.current?.();
    onSelect(object.id);
    onBeginObjectChange();
    const stage = stageRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = object.x;
    const originY = object.y;
    if (object.seamStamp) {
      const move = (moveEvent) => {
        const y = originY + ((moveEvent.clientY - startY) / stage.height) * 100;
        onMoveSeamGroup(object.seamGroupId, y, false);
      };
      const cleanup = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', cleanup);
        window.removeEventListener('pointercancel', cleanup);
        if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = null;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', cleanup);
      window.addEventListener('pointercancel', cleanup);
      pointerCleanupRef.current = cleanup;
      return;
    }
    const move = (moveEvent) => {
      onChangeObject(object.id, clampObjectPosition({
        x: originX + ((moveEvent.clientX - startX) / stage.width) * 100,
        y: originY + ((moveEvent.clientY - startY) / stage.height) * 100,
        width: object.width,
        height: object.height,
      }), false);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
    pointerCleanupRef.current = cleanup;
  };

  const beginStampResize = (event, object, corner) => {
    event.preventDefault();
    event.stopPropagation();
    pointerCleanupRef.current?.();
    onSelect(object.id);
    const stage = stageRef.current.getBoundingClientRect();
    let changed = false;
    const move = (moveEvent) => {
      if (!changed) {
        changed = true;
        onBeginObjectChange();
      }
      onResizeStamp(object, corner, {
        x: ((moveEvent.clientX - stage.left) / stage.width) * 100,
        y: ((moveEvent.clientY - stage.top) / stage.height) * 100,
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
    pointerCleanupRef.current = cleanup;
  };

  const pointFromEvent = (event) => {
    const bounds = stageRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
  };

  const beginRedaction = (event) => {
    if (!redactionMode) {
      onSelect(null);
      return;
    }
    event.preventDefault();
    pointerCleanupRef.current?.();
    const start = pointFromEvent(event);
    const move = (moveEvent) => {
      setDraftRedaction(createRedactionFromPoints(start, pointFromEvent(moveEvent), {
        id: 'redaction-draft',
        color: redactionColor,
      }));
    };
    const up = (upEvent) => {
      const object = createRedactionFromPoints(start, pointFromEvent(upEvent), {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        color: redactionColor,
      });
      cleanup();
      if (object) onAddRedaction(object);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cleanup);
      setDraftRedaction(null);
      if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cleanup);
    pointerCleanupRef.current = cleanup;
  };

  const crop = pageState.crop;
  return (
    <div className="editor-stage-viewport" ref={viewportRef}>
      {renderError && <p role="alert">{renderError}</p>}
      <div
        ref={stageRef}
        className="editor-stage"
        style={{
          clipPath: `inset(${crop.top * 100}% ${(1 - crop.right) * 100}% ${(1 - crop.bottom) * 100}% ${crop.left * 100}%)`,
          background: pageState.background || '#ffffff',
        }}
        onPointerDown={beginRedaction}
      >
        <canvas
          ref={canvasRef}
          style={{
            filter: `grayscale(${pageState.scan.grayscale}%) contrast(${pageState.scan.contrast}%) brightness(${pageState.scan.brightness}%)`,
          }}
        />
        <div className={`editor-overlay ${redactionMode ? 'redaction-mode' : ''}`}>
          {draftRedaction && (
            <div
              className="redaction-draft"
              style={{
                left: `${draftRedaction.x}%`,
                top: `${draftRedaction.y}%`,
                width: `${draftRedaction.width}%`,
                height: `${draftRedaction.height}%`,
                backgroundColor: draftRedaction.color,
              }}
            />
          )}
          {pageState.objects.map((object) => (
            <div
              key={object.id}
              className={`editor-object ${object.seamStamp ? 'seam-stamp-slice' : ''} ${selectedId === object.id ? 'selected' : ''} ${object.confidence < 65 ? 'low-confidence' : ''}`}
              style={{
                left: `${object.x}%`,
                top: `${object.y}%`,
                width: `${object.width}%`,
                height: `${object.height}%`,
                transform: `rotate(${object.rotation || 0}deg)`,
                opacity: object.opacity ?? 1,
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                beginDrag(event, object);
              }}
            >
              {object.type === 'redaction' ? (
                <div className="redaction-fill" style={{ backgroundColor: object.color }} />
              ) : object.type === 'image' || object.type === 'stamp' ? (
                <img src={object.src} alt={object.type === 'stamp' ? '电子签章' : '插入内容'} draggable="false" />
              ) : (
                <textarea
                  value={object.text}
                  onPointerDown={(event) => event.stopPropagation()}
                  onFocus={() => onSelect(object.id)}
                  onChange={(event) => onChangeObject(object.id, { text: event.target.value }, true)}
                  style={{
                    color: object.color,
                    fontSize: `${object.fontSize * textScale}px`,
                    textAlign: object.align || 'left',
                    fontWeight: object.bold ? 700 : 400,
                    background: object.coverOriginal ? object.coverColor || '#ffffff' : 'transparent',
                  }}
                />
              )}
              {!object.seamStamp && (
                <button
                  type="button"
                  className="object-drag-handle"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    beginDrag(event, object);
                  }}
                  aria-label="拖动对象"
                >移动</button>
              )}
              {selectedId === object.id && object.type === 'stamp' && !object.seamStamp && (
                <>
                  {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
                    <button key={corner} type="button"
                      className={`stamp-resize-handle ${corner}`}
                      tabIndex={-1}
                      aria-label={`${corner} 鼠标等比例缩放签章；键盘请使用属性栏尺寸控件`}
                      onPointerDown={(event) => beginStampResize(event, object, corner)} />
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
