export function normalizeWhiteRemovalStrength(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 60;
  return Math.max(0, Math.min(100, numeric));
}

export function parseStampSizeDraft(draft, max = 60) {
  if (String(draft).trim() === '') return null;
  const value = Number(draft);
  if (!Number.isFinite(value)) return null;
  return Math.max(5, Math.min(Number(max) || 60, value));
}

export function isSupportedEditorFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return /\.(pdf|docx)$/i.test(name || '');
}

export function calculateStampHeight(width, pageAspectRatio, imageAspectRatio) {
  const safePageRatio = Number(pageAspectRatio) > 0 ? Number(pageAspectRatio) : 595 / 842;
  const safeImageRatio = Number(imageAspectRatio) > 0 ? Number(imageAspectRatio) : 1;
  return Number(width) * safePageRatio / safeImageRatio;
}

export function calculateScaledDimensions(width, height, maxEdge = 1600) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, Math.max(1, Number(maxEdge) || 1600) / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function removeWhitePixels(imageData, strength = 60) {
  const normalized = normalizeWhiteRemovalStrength(strength);
  if (normalized === 0) return imageData;

  const cutoff = 255 - normalized * 0.75;
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;

    if (chroma > 24 || minimum <= cutoff) continue;

    const whiteness = (minimum - cutoff) / Math.max(1, 255 - cutoff);
    data[index + 3] = Math.round(data[index + 3] * (1 - whiteness));
  }
  return imageData;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to read the stamp image.'));
    image.src = dataUrl;
  });
}

export async function resizeStampImage(dataUrl, maxEdge = 1600) {
  const image = await loadImage(dataUrl);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const dimensions = calculateScaledDimensions(naturalWidth, naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
  return {
    src: canvas.toDataURL('image/png'),
    imageAspectRatio: naturalWidth / naturalHeight,
  };
}

export async function makeStampTransparent(dataUrl, strength = 60) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  removeWhitePixels(imageData, strength);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createStampObject(originalSrc, src, options = {}) {
  return {
    id: options.id,
    type: 'stamp',
    originalSrc,
    src,
    whiteRemovalStrength: normalizeWhiteRemovalStrength(options.whiteRemovalStrength ?? 60),
    x: options.x ?? 32,
    y: options.y ?? 38,
    width: options.width ?? 28,
    height: options.height ?? 20,
    rotation: options.rotation ?? 0,
    opacity: options.opacity ?? 1,
    imageAspectRatio: Number(options.imageAspectRatio) > 0 ? Number(options.imageAspectRatio) : 1,
  };
}

export function updateStampOnPage(pageStates, pageIndex, stampId, patch) {
  const page = pageStates[pageIndex];
  if (!page) return pageStates;
  const objectIndex = page.objects.findIndex((object) => object.id === stampId);
  if (objectIndex === -1) return pageStates;

  const objects = [...page.objects];
  objects[objectIndex] = { ...objects[objectIndex], ...patch };
  const next = [...pageStates];
  next[pageIndex] = { ...page, objects };
  return next;
}

export function updateStampBatchSize(pageStates, batchId, newHeight) {
  const height = Number(newHeight);
  if (!Number.isFinite(height) || height <= 0 || height > 100) {
    throw new Error('签章高度无效');
  }
  const groups = new Map();
  pageStates.forEach((page) => page.objects.forEach((object) => {
    if (object.stampBatchId === batchId && object.seamStamp && !groups.has(object.seamGroupId)) {
      groups.set(object.seamGroupId, object.y);
    }
  }));
  if (height * groups.size > 100) throw new Error('骑缝章组无法容纳，请减小签章大小');
  const orderedGroups = [...groups.entries()].sort((a, b) => a[1] - b[1]);
  const originalTop = orderedGroups.length ? Math.min(...orderedGroups.map((entry) => entry[1])) : 0;
  const originalBottom = orderedGroups.length
    ? Math.max(...pageStates.flatMap((page) => page.objects)
      .filter((object) => object.stampBatchId === batchId && object.seamStamp)
      .map((object) => object.y + object.height))
    : 100;
  const spanStart = Math.max(0, Math.min(originalTop, 100 - height * groups.size));
  const originalSpan = originalBottom - originalTop;
  const spanEnd = originalSpan >= height * groups.size ? originalBottom : 100;
  const gap = groups.size <= 1 ? 0 : (spanEnd - spanStart - height * groups.size) / (groups.size - 1);
  const groupY = new Map(orderedGroups.map(([groupId], index) => [groupId, spanStart + index * (height + gap)]));

  return pageStates.map((page) => {
    let changed = false;
    const objects = page.objects.map((object) => {
      if (object.stampBatchId !== batchId) return object;
      changed = true;
      const width = object.height > 0 ? object.width * height / object.height : object.width;
      return {
        ...object,
        width,
        height,
        x: object.seamStamp
          ? (object.seamSide === 'left' ? -width / 2 : 100 - width / 2)
          : object.x,
        y: object.seamStamp
          ? groupY.get(object.seamGroupId)
          : Math.max(0, Math.min(100 - height, object.y)),
      };
    });
    return changed ? { ...page, objects } : page;
  });
}

export function clampObjectPosition({ x, y, width, height }) {
  const objectWidth = Math.max(0, Number(width) || 0);
  const objectHeight = Math.max(0, Number(height) || 0);
  return {
    x: Math.max(0, Math.min(100 - objectWidth, Number(x) || 0)),
    y: Math.max(0, Math.min(100 - objectHeight, Number(y) || 0)),
  };
}

export function resizeStampFromCorner(object, corner, pointer, minHeight = 5, maxHeight = 100) {
  const left = object.x;
  const top = object.y;
  const right = object.x + object.width;
  const bottom = object.y + object.height;
  const anchorX = corner.includes('left') ? right : left;
  const anchorY = corner.includes('top') ? bottom : top;
  const directionX = corner.includes('left') ? -1 : 1;
  const directionY = corner.includes('top') ? -1 : 1;
  const ratio = object.width / object.height;
  const availableWidth = directionX < 0 ? anchorX : 100 - anchorX;
  const availableHeight = directionY < 0 ? anchorY : 100 - anchorY;
  const requestedWidth = Math.abs(Number(pointer.x) - anchorX);
  const requestedHeight = Math.abs(Number(pointer.y) - anchorY);
  const height = Math.max(minHeight, Math.min(
    Math.max(requestedHeight, requestedWidth / ratio),
    availableHeight,
    availableWidth / ratio,
    Number(maxHeight) || 100
  ));
  const width = height * ratio;
  return {
    x: directionX < 0 ? anchorX - width : anchorX,
    y: directionY < 0 ? anchorY - height : anchorY,
    width,
    height,
  };
}

function verticalRangesOverlap(firstY, firstHeight, secondY, secondHeight) {
  return firstY < secondY + secondHeight && secondY < firstY + firstHeight;
}

function rectanglesOverlap(first, second) {
  return first.x < second.x + second.width && second.x < first.x + first.width
    && first.y < second.y + second.height && second.y < first.y + first.height;
}

export function copyStamp(pageStates, pageIndex, stampId, options = {}) {
  const source = pageStates[pageIndex]?.objects.find((object) => object.id === stampId);
  if (!source || source.type !== 'stamp') throw new Error('未找到要复制的签章');
  const offset = Number(options.offset) || 5;

  if (!source.seamStamp) {
    const maxX = Math.max(0, Math.floor(100 - source.width));
    const maxY = Math.max(0, Math.floor(100 - source.height));
    const directional = [
      { x: source.x + source.width + offset, y: source.y },
      { x: source.x, y: source.y + source.height + offset },
      { x: source.x - source.width - offset, y: source.y },
      { x: source.x, y: source.y - source.height - offset },
    ].map((position) => clampObjectPosition({ ...position, width: source.width, height: source.height }));
    const grid = [];
    for (let y = 0; y <= maxY; y += 5) {
      for (let x = 0; x <= maxX; x += 5) grid.push({ x, y });
    }
    const occupied = pageStates[pageIndex].objects;
    const position = [...directional, ...grid].find((candidate) => occupied.every((object) => (
      !rectanglesOverlap({ ...candidate, width: source.width, height: source.height }, object)
    )));
    if (!position) throw new Error('页面没有足够空间复制签章');
    const copy = {
      ...source,
      id: options.objectId,
      stampBatchId: options.batchId,
      ...position,
    };
    delete copy.seamStamp;
    delete copy.seamGroupId;
    delete copy.sliceIndex;
    delete copy.sliceCount;
    const next = [...pageStates];
    next[pageIndex] = {
      ...pageStates[pageIndex],
      objects: [...pageStates[pageIndex].objects, copy],
    };
    return { pageStates: next, selectedId: copy.id };
  }

  const slices = [];
  pageStates.forEach((page, index) => page.objects.forEach((object) => {
    if (object.seamGroupId === source.seamGroupId) slices.push({ object, pageIndex: index });
  }));
  const originalY = source.y;
  const height = source.height;
  const sourceSide = source.seamSide === 'left' ? 'left' : 'right';
  const maxY = Math.max(0, Math.floor(100 - height));
  const preferredY = Math.max(0, Math.min(maxY, Math.round(originalY + offset)));
  const candidates = Array.from({ length: maxY + 1 }, (_, y) => y)
    .sort((a, b) => Math.abs(a - preferredY) - Math.abs(b - preferredY) || b - a);
  const targetY = candidates.find((candidateY) => slices.every(({ pageIndex: targetPage }) => (
    pageStates[targetPage].objects.every((object) => (
      !object.seamStamp
      || object.seamGroupId === options.seamGroupId
      || (object.seamSide === 'left' ? 'left' : 'right') !== sourceSide
      || !verticalRangesOverlap(candidateY, height, object.y, object.height)
    ))
  )));
  if (targetY === undefined) throw new Error('没有足够空间复制整组骑缝章');

  const idBySource = new Map(slices.map((slice, index) => [slice.object.id, options.objectIds?.[index]]));
  const copiedByPage = new Map();
  slices.forEach(({ object, pageIndex: targetPage }) => {
    const copy = {
      ...object,
      id: idBySource.get(object.id),
      stampBatchId: options.batchId,
      seamGroupId: options.seamGroupId,
      y: targetY,
    };
    copiedByPage.set(targetPage, [...(copiedByPage.get(targetPage) || []), copy]);
  });
  const next = pageStates.map((page, index) => copiedByPage.has(index)
    ? { ...page, objects: [...page.objects, ...copiedByPage.get(index)] }
    : page);
  const selectedCopy = copiedByPage.get(pageIndex)?.find((object) => object.sliceIndex === source.sliceIndex)
    || copiedByPage.get(pageIndex)?.[0];
  return { pageStates: next, selectedId: selectedCopy?.id };
}

export function getStampBatchSizeLimit(pageStates, batchId) {
  if (!batchId) return 60;

  const groups = new Set();
  pageStates.forEach((page) => page.objects.forEach((object) => {
    if (object.stampBatchId === batchId && object.seamGroupId) groups.add(object.seamGroupId);
  }));
  return groups.size ? Math.min(60, Math.floor(100 / groups.size)) : 60;
}

export function moveSeamStampGroup(pageStates, groupId, newY) {
  const requestedY = Number(newY);
  if (!Number.isFinite(requestedY)) return pageStates;
  return pageStates.map((page) => {
    let changed = false;
    const objects = page.objects.map((object) => {
      if (object.seamGroupId !== groupId) return object;
      changed = true;
      return {
        ...object,
        y: Math.max(0, Math.min(100 - object.height, requestedY)),
      };
    });
    return changed ? { ...page, objects } : page;
  });
}

export function validateSeamPageRange(startPage, endPage, pageCount) {
  const start = Number(startPage);
  const end = Number(endPage);
  const count = Number(pageCount);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > count) {
    return { valid: false, error: '页码必须在文档范围内' };
  }
  if (end < start) return { valid: false, error: '结束页不能小于开始页' };
  if (end - start < 1) return { valid: false, error: '骑缝章至少需要 2 页' };
  return {
    valid: true,
    pages: Array.from({ length: end - start + 1 }, (_, index) => start + index),
  };
}

export function createSeamStampLayout(pages, options = {}) {
  const width = Number(options.width) || 8;
  const seamSide = options.side === 'left' ? 'left' : 'right';
  return pages.map((pageNumber, sliceIndex) => ({
    pageNumber,
    x: seamSide === 'left' ? -width / 2 : 100 - width / 2,
    y: Number(options.top) || 0,
    width,
    height: Number(options.height) || 20,
    opacity: options.opacity ?? 1,
    seamGroupId: options.groupId,
    seamSide,
    sliceIndex,
    sliceCount: pages.length,
  }));
}

export function insertSeamStampObjects(pageStates, objects) {
  const next = [...pageStates];
  objects.forEach((object) => {
    const pageIndex = object.pageNumber - 1;
    const page = next[pageIndex];
    if (!page) return;
    next[pageIndex] = { ...page, objects: [...page.objects, object] };
  });
  return next;
}

export function calculateVerticalSliceRegions(sourceWidth, sliceCount) {
  const width = Math.max(1, Math.floor(Number(sourceWidth) || 1));
  const count = Math.max(1, Math.floor(Number(sliceCount) || 1));
  if (count > width) throw new Error('切片数量不能超过图片宽度');
  const baseWidth = Math.floor(width / count);
  return Array.from({ length: count }, (_, index) => ({
    x: index * baseWidth,
    width: index === count - 1 ? width - index * baseWidth : baseWidth,
  }));
}

export function calculateSeamSliceWidthPercent({
  heightPercent,
  pageAspectRatio,
  stampAspectRatio,
  sliceCount,
}) {
  const pageWidthOverHeight = Number(pageAspectRatio) > 0 ? Number(pageAspectRatio) : 595 / 842;
  const count = Math.max(1, Number(sliceCount) || 1);
  return Number(heightPercent) / pageWidthOverHeight * (Number(stampAspectRatio) || 1) / count;
}

export function createSeamGroupLayouts({ groupCount, height, top = 5, bottom = 5 }) {
  const count = Number(groupCount);
  const groupHeight = Number(height);
  if (!Number.isInteger(count) || count < 1 || count > 3) {
    throw new Error('骑缝章数量必须为 1-3');
  }
  if (!Number.isFinite(groupHeight) || groupHeight <= 0) {
    throw new Error('骑缝章高度必须为正数');
  }
  const topSpace = Number(top);
  const bottomSpace = Number(bottom);
  if (!Number.isFinite(topSpace) || !Number.isFinite(bottomSpace) || topSpace < 0 || bottomSpace < 0) {
    throw new Error('页面留白不能为负数');
  }
  const available = 100 - topSpace - bottomSpace;
  if (available < 0) throw new Error('页面空间不足，请减小印章尺寸或数量');
  if (groupHeight * count > available) {
    throw new Error('页面空间不足，请减小印章尺寸或数量');
  }
  const gap = count === 1 ? 0 : (available - groupHeight * count) / (count - 1);
  return Array.from({ length: count }, (_, groupIndex) => ({
    groupIndex,
    top: topSpace + groupIndex * (groupHeight + gap),
    height: groupHeight,
  }));
}

export async function createVerticalStampSlices(dataUrl, sliceCount) {
  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  return calculateVerticalSliceRegions(sourceWidth, sliceCount).map((region) => {
    const canvas = document.createElement('canvas');
    canvas.width = region.width;
    canvas.height = sourceHeight;
    canvas.getContext('2d').drawImage(
      image,
      region.x,
      0,
      region.width,
      sourceHeight,
      0,
      0,
      region.width,
      sourceHeight
    );
    return {
      src: canvas.toDataURL('image/png'),
      imageAspectRatio: region.width / sourceHeight,
    };
  });
}
