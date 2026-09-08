import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function PdfCanvasPage({ pdf, pageNumber, scale, deleted, onToggle, label, rotation = 0, onRotate }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    let renderTask;

    async function render() {
      setStatus('loading');
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
        });
        await renderTask.promise;
        if (!cancelled) setStatus('ready');
      } catch (error) {
        if (!cancelled && error?.name !== 'RenderingCancelledException') setStatus('error');
      }
    }

    render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, scale, rotation]);

  return (
    <article
      id={`pdf-page-${pageNumber}`}
      data-page-number={pageNumber}
      className={`pdf-page-shell ${deleted ? 'is-deleted' : ''}`}
    >
      <div className="pdf-page-heading">
        <div>
          <strong>第 {pageNumber} 页</strong>
          {label && <span>{label}</span>}
        </div>
        {onRotate && <button className="page-action" onClick={() => onRotate(pageNumber)} aria-label={`旋转第 ${pageNumber} 页`}>旋转 90°</button>}
        <button
          type="button"
          className={deleted ? 'page-action restore' : 'page-action'}
          onClick={() => onToggle(pageNumber)}
          aria-label={deleted ? `恢复第 ${pageNumber} 页` : `删除第 ${pageNumber} 页`}
        >
          {deleted ? '恢复此页' : '标记删除'}
        </button>
      </div>
      <div className="pdf-canvas-wrap">
        {status === 'loading' && <Skeleton className="absolute inset-0" />}
        {status === 'error' && <div className="pdf-render-error">这一页暂时无法渲染，请重新载入文件。</div>}
        <canvas ref={canvasRef} className={status === 'ready' ? 'opacity-100' : 'opacity-0'} />
        {deleted && <div className="deleted-overlay"><span>待删除</span></div>}
      </div>
    </article>
  );
}
