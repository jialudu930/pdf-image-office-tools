import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from '@/lib/pdfLoader';
import { Minus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import PdfCanvasPage from './PdfCanvasPage';
import { canDeletePage } from '@/lib/pdfWorkspace';


export default function PdfWorkspace({
  bytes,
  deletedPages,
  onDeletedPagesChange,
  pageMetadata = [],
  title = 'PDF 页面预览',
  order,
  onOrderChange,
  rotations = {},
  onRotate,
}) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const [activePage, setActivePage] = useState(1);
  const scrollRef = useRef(null);

  useEffect(() => {
    let task;
    let cancelled = false;
    setPdf(null);
    setError('');
    if (!bytes) return undefined;

    try {
      const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
      task = pdfjsLib.getDocument({ data });
      task.promise.then((loaded) => {
        if (!cancelled) setPdf(loaded);
      }).catch((reason) => {
        if (!cancelled) setError(reason?.name === 'PasswordException'
          ? '该 PDF 受密码保护，请先解除密码后重试。'
          : 'PDF 预览加载失败，请确认文件没有损坏。');
      });
    } catch {
      setError('PDF 预览加载失败，请重新选择文件。');
    }
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !pdf) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActivePage(Number(visible[0].target.dataset.pageNumber));
    }, { root, threshold: [0.2, 0.55, 0.8] });
    root.querySelectorAll('[data-page-number]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pdf, scale]);

  const pageNumbers = useMemo(
    () => order?.length ? order : Array.from({ length: pdf?.numPages || 0 }, (_, index) => index + 1),
    [pdf, order]
  );

  const togglePage = (pageNumber) => {
    if (!canDeletePage(pageNumbers.length, deletedPages, pageNumber)) return;
    const next = new Set(deletedPages);
    next.has(pageNumber) ? next.delete(pageNumber) : next.add(pageNumber);
    onDeletedPagesChange(next);
  };

  const jumpTo = (pageNumber) => {
    document.getElementById(`pdf-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (error) return <div className="workspace-error"><strong>无法打开预览</strong><p>{error}</p></div>;
  if (!pdf) return <div className="workspace-loading"><div className="loading-bar" /><p>正在解析 PDF 页面…</p></div>;

  return (
    <section className="pdf-workspace">
      <header className="pdf-toolbar">
        <div>
          <h2>{title}</h2>
        </div>
        <div className="toolbar-actions">
          <span className="page-indicator">{activePage} / {pdf.numPages}</span>
          <button type="button" onClick={() => setScale((value) => Math.max(.55, value - .15))} aria-label="缩小"><Minus /></button>
          <span className="zoom-value">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale((value) => Math.min(1.8, value + .15))} aria-label="放大"><Plus /></button>
          <button type="button" className="text-action" onClick={() => setScale(1)}>适合宽度</button>
        </div>
      </header>

      <div className="pdf-workspace-body">
        <aside className="thumbnail-rail" aria-label="页面导航">
          {pageNumbers.map((pageNumber, index) => (
            <div key={pageNumber} className="page-order-item" draggable={Boolean(onOrderChange)} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(pageNumber))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
              event.preventDefault(); event.stopPropagation();
              const source = Number(event.dataTransfer.getData('text/plain'));
              if (!pageNumbers.includes(source) || source === pageNumber) return;
              const next = pageNumbers.filter((n) => n !== source); next.splice(index, 0, source); onOrderChange?.(next);
            }}>
            <button
              type="button"
              key={pageNumber}
              onClick={() => jumpTo(pageNumber)}
              className={`${activePage === pageNumber ? 'active' : ''} ${deletedPages.has(pageNumber) ? 'deleted' : ''}`}
            >
              <span>{pageNumber}</span>
              <small>{deletedPages.has(pageNumber) ? '待删除' : '第 ' + pageNumber + ' 页'}</small>
            </button>
            {onOrderChange && <div className="page-order-actions"><button aria-label={`第 ${pageNumber} 页前移`} disabled={index === 0} onClick={() => { const next = [...pageNumbers]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onOrderChange(next); }}>↑</button><button aria-label={`第 ${pageNumber} 页后移`} disabled={index === pageNumbers.length - 1} onClick={() => { const next = [...pageNumbers]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onOrderChange(next); }}>↓</button></div>}
            </div>
          ))}
        </aside>

        <div className="pdf-scroll" ref={scrollRef}>
          {pageNumbers.map((pageNumber) => {
            const meta = pageMetadata[pageNumber - 1];
            const label = meta ? `来自 ${meta.sourceName} · 原第 ${meta.sourcePageNumber} 页` : '';
            return (
              <PdfCanvasPage
                key={pageNumber}
                pdf={pdf}
                pageNumber={pageNumber}
                scale={scale}
                deleted={deletedPages.has(pageNumber)}
                onToggle={togglePage}
                label={label}
                rotation={rotations[pageNumber] || 0}
                onRotate={onRotate}
              />
            );
          })}
        </div>

        <aside className="selection-summary">
          <div>
            <strong>{pdf.numPages - deletedPages.size} 页保留</strong>
            <p>原 {pdf.numPages} 页，标记删除 {deletedPages.size} 页</p>
          </div>
          {deletedPages.size > 0 ? (
            <>
              <div className="deleted-list">
                {[...deletedPages].sort((a, b) => a - b).map((pageNumber) => (
                  <button key={pageNumber} type="button" onClick={() => jumpTo(pageNumber)}>
                    <Trash2 />第 {pageNumber} 页
                  </button>
                ))}
              </div>
              <button type="button" className="reset-action" onClick={() => onDeletedPagesChange(new Set())}>
                <RotateCcw />恢复全部页面
              </button>
            </>
          ) : <p className="empty-copy">还没有标记删除的页面。可在正文页右上角操作。</p>}
        </aside>
      </div>
    </section>
  );
}
