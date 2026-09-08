export function parsePageRange(value, pageCount) {
  if (!value || value.trim() === '全部') {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const pages = new Set();
  value.split(',').forEach((part) => {
    const trimmed = part.trim();
    if (/^\d+$/.test(trimmed)) {
      const page = Number(trimmed);
      if (page >= 1 && page <= pageCount) pages.add(page);
      return;
    }
    const match = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!match) return;
    const start = Math.max(1, Number(match[1]));
    const end = Math.min(pageCount, Number(match[2]));
    for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) {
      if (page <= pageCount) pages.add(page);
    }
  });
  return [...pages].sort((a, b) => a - b);
}

export function normalizeCrop(crop) {
  const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const left = clamp(crop.left);
  const top = clamp(crop.top);
  const right = Math.max(left + 0.05, clamp(crop.right));
  const bottom = Math.max(top + 0.05, clamp(crop.bottom));
  return {
    left,
    top,
    right: Math.min(1, right),
    bottom: Math.min(1, bottom),
  };
}

export function pushHistory(history, state, limit = 30) {
  return [...history, state].slice(-limit);
}

export function createRedactionFromPoints(start, end, options = {}) {
  const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
  const startX = clamp(start?.x);
  const startY = clamp(start?.y);
  const endX = clamp(end?.x);
  const endY = clamp(end?.y);
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  if (width < 1 || height < 1) return null;

  return {
    id: options.id,
    type: 'redaction',
    x,
    y,
    width,
    height,
    color: options.color === '#ffffff' ? '#ffffff' : '#000000',
  };
}

export function createEditorPage() {
  return {
    objects: [],
    crop: { left: 0, top: 0, right: 1, bottom: 1 },
    scan: { grayscale: 0, contrast: 100, brightness: 100 },
    background: '',
    ocrWords: [],
  };
}
