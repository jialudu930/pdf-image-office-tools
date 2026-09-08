import { useCallback, useEffect, useRef, useState } from 'react';
import { adjustCrop } from '@/lib/imageUtils';

const HANDLES = [
  ['n', '上边'], ['s', '下边'], ['w', '左边'], ['e', '右边'],
  ['nw', '左上角'], ['ne', '右上角'], ['sw', '左下角'], ['se', '右下角'],
];

function keyboardDelta(key, step) {
  if (key === 'ArrowLeft') return { x: -step, y: 0 };
  if (key === 'ArrowRight') return { x: step, y: 0 };
  if (key === 'ArrowUp') return { x: 0, y: -step };
  if (key === 'ArrowDown') return { x: 0, y: step };
  return null;
}

function cropsEqual(a, b) {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

export default function ImageDirectCropEditor({ file, crop, onCommit, onInteractionChange, disabled = false }) {
  const [draft, setDraft] = useState(crop);
  const draftRef = useRef(crop);
  const cropRef = useRef(crop);
  const commitRef = useRef(onCommit);
  const interactionRef = useRef(onInteractionChange);
  const stageRef = useRef(null);
  const sessionRef = useRef(null);
  cropRef.current = crop;
  commitRef.current = onCommit;
  interactionRef.current = onInteractionChange;

  const updateDraft = useCallback((next) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const endSession = useCallback((commit) => {
    const session = sessionRef.current;
    if (!session) return;
    window.removeEventListener('pointermove', session.onMove);
    window.removeEventListener('pointerup', session.onUp);
    window.removeEventListener('pointercancel', session.onCancel);
    window.removeEventListener('blur', session.onBlur);
    if (session.pointerId != null) {
      try { session.captureTarget?.releasePointerCapture?.(session.pointerId); } catch { /* capture may already be released */ }
    }
    sessionRef.current = null;
    interactionRef.current?.(false);
    if (commit && !cropsEqual(session.startCrop, draftRef.current)) commitRef.current(draftRef.current);
    if (!commit) updateDraft(cropRef.current);
  }, [updateDraft]);

  useEffect(() => {
    updateDraft(cropRef.current);
    return () => endSession(false);
  }, [crop.left, crop.top, crop.right, crop.bottom, file.id, endSession, updateDraft]);

  const startPointerSession = (event, handle) => {
    event.stopPropagation();
    if (disabled || (event.button != null && event.button !== 0) || sessionRef.current) return;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return;
    const startCrop = draftRef.current;
    const startPoint = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    const captureTarget = event.currentTarget;
    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      updateDraft(adjustCrop(startCrop, handle, {
        x: (moveEvent.clientX - startPoint.x) / bounds.width,
        y: (moveEvent.clientY - startPoint.y) / bounds.height,
      }));
    };
    const onUp = (upEvent) => {
      if (upEvent.pointerId === pointerId) endSession(true);
    };
    const onCancel = (cancelEvent) => {
      if (cancelEvent.pointerId === pointerId) endSession(false);
    };
    const onBlur = () => endSession(false);
    sessionRef.current = { startCrop, pointerId, captureTarget, onMove, onUp, onCancel, onBlur };
    if (pointerId != null) {
      try { captureTarget.setPointerCapture?.(pointerId); } catch { /* window listeners remain the fallback */ }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    interactionRef.current?.(true);
  };

  const handleKeyDown = (event, handle) => {
    event.stopPropagation();
    if (disabled) return;
    const delta = keyboardDelta(event.key, event.shiftKey ? .05 : .01);
    if (!delta) return;
    event.preventDefault();
    const next = adjustCrop(draftRef.current, handle, delta);
    if (cropsEqual(next, draftRef.current)) return;
    updateDraft(next);
    commitRef.current(next);
  };

  const frameStyle = {
    left: `${draft.left * 100}%`,
    top: `${draft.top * 100}%`,
    width: `${(draft.right - draft.left) * 100}%`,
    height: `${(draft.bottom - draft.top) * 100}%`,
  };

  return <section className="direct-crop-editor" aria-label={`裁剪 ${file.name}`}>
    <div className="direct-crop-heading"><strong>{file.name}</strong><span>拖动橙色边框裁剪，拖动框内区域移动</span></div>
    <div ref={stageRef} data-testid="crop-stage" className="direct-crop-stage" style={{ aspectRatio: `${file.width} / ${file.height}` }}>
      <img src={file.previewUrl} alt={file.name} draggable="false" />
      <div
        className="direct-crop-frame"
        style={frameStyle}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="裁剪区域"
        aria-disabled={disabled}
        onPointerDown={(event) => startPointerSession(event, 'move')}
        onKeyDown={(event) => handleKeyDown(event, 'move')}
      >
        {HANDLES.map(([handle, label]) => <button
          key={handle}
          type="button"
          disabled={disabled}
          className={`direct-crop-handle handle-${handle}`}
          aria-label={`调整${label}`}
          onPointerDown={(event) => startPointerSession(event, handle)}
          onKeyDown={(event) => handleKeyDown(event, handle)}
        />)}
      </div>
    </div>
  </section>;
}
