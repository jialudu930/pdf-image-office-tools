export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        previewUrl: url,
        file,
        id: Date.now() + Math.random(),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
}

export function getCoverScale(image, regionWidth, regionHeight) {
  return Math.max(regionWidth / image.width, regionHeight / image.height);
}

export const FULL_CROP = Object.freeze({ left: 0, top: 0, right: 1, bottom: 1 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const cleanNumber = (value) => Math.round(value * 1000000) / 1000000;

export function adjustCrop(crop, handle, delta, minSize = .05) {
  if (handle === 'move') {
    const width = crop.right - crop.left;
    const height = crop.bottom - crop.top;
    const left = clamp(crop.left + delta.x, 0, 1 - width);
    const top = clamp(crop.top + delta.y, 0, 1 - height);
    return {
      left: cleanNumber(left),
      top: cleanNumber(top),
      right: cleanNumber(left + width),
      bottom: cleanNumber(top + height),
    };
  }

  const next = { ...crop };
  if (handle.includes('w')) next.left = clamp(crop.left + delta.x, 0, crop.right - minSize);
  if (handle.includes('e')) next.right = clamp(crop.right + delta.x, crop.left + minSize, 1);
  if (handle.includes('n')) next.top = clamp(crop.top + delta.y, 0, crop.bottom - minSize);
  if (handle.includes('s')) next.bottom = clamp(crop.bottom + delta.y, crop.top + minSize, 1);
  return Object.fromEntries(Object.entries(next).map(([key, value]) => [key, cleanNumber(value)]));
}

export function getCropOutputHeight(image, crop, outputWidth) {
  const sourceWidth = image.width * (crop.right - crop.left);
  const sourceHeight = image.height * (crop.bottom - crop.top);
  return outputWidth * sourceHeight / sourceWidth;
}

export function getPanoramaPreviewScale(width, height, requestedScale, maxWidth = 1600, maxHeight = 5000) {
  if (!width || !height) return requestedScale;
  return Math.min(requestedScale, maxWidth / width, maxHeight / height);
}

export function quantizePanoramaRegions(items) {
  const totalHeight = items.reduce((sum, item) => sum + Math.max(0, Number(item.regionHeight) || 0), 0);
  const height = Math.ceil(totalHeight);
  let cumulativeHeight = 0;
  let previousBoundary = 0;
  const regions = items.map((item, index) => {
    cumulativeHeight += Math.max(0, Number(item.regionHeight) || 0);
    const nextBoundary = index === items.length - 1 ? height : Math.round(cumulativeHeight);
    const region = { y: previousBoundary, height: nextBoundary - previousBoundary };
    previousBoundary = nextBoundary;
    return region;
  });
  return { height, regions };
}

function createQuantizedLayout(width, items) {
  const { height, regions } = quantizePanoramaRegions(items);
  return { width, height, items, regions };
}

export function createPanoramaLayout(images, previousItems = [], establishedWidth = 0) {
  const width = images.length ? (establishedWidth && previousItems.length >= 2
    ? establishedWidth
    : Math.max(...images.slice(0, 2).map((image) => image.width))) : 0;
  const previous = new Map(previousItems.map((item) => [item.id, item]));
  const items = images.map((image) => {
    const crop = previous.get(image.id)?.crop || { ...FULL_CROP };
    return {
      id: image.id,
      crop: { ...crop },
      sourceWidth: image.width,
      sourceHeight: image.height,
      regionHeight: width ? getCropOutputHeight(image, crop, width) : 0,
    };
  });
  return createQuantizedLayout(width, items);
}

export function updatePanoramaCrop(layout, id, crop) {
  const items = layout.items.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      crop: { ...crop },
      regionHeight: getCropOutputHeight(
        { width: item.sourceWidth, height: item.sourceHeight },
        crop,
        layout.width,
      ),
    };
  });
  return { ...layout, ...createQuantizedLayout(layout.width, items) };
}

export function getPanoramaDrawRect(image, item, outputWidth, destinationY = 0) {
  const crop = item.crop || FULL_CROP;
  return {
    sx: image.width * crop.left,
    sy: image.height * crop.top,
    sw: image.width * (crop.right - crop.left),
    sh: image.height * (crop.bottom - crop.top),
    dx: 0,
    dy: destinationY,
    dw: outputWidth,
    dh: item.regionHeight,
  };
}

export function validateCanvasSize(width, height) {
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192 || width * height > 16000000) {
    throw new Error('画布尺寸超过浏览器安全上限');
  }
}

export async function mergeImages(images, format = 'image/png', layout = createPanoramaLayout(images)) {
  const maxWidth = Math.round(layout.width);
  const quantized = quantizePanoramaRegions(layout.items);
  const totalHeight = quantized.height;
  validateCanvasSize(maxWidth, totalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法创建图片画布');

  for (let index = 0; index < images.length; index += 1) {
    const info = images[index];
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = info.previewUrl;
    });
    const region = quantized.regions[index];
    const item = { ...layout.items[index], regionHeight: region.height };
    const rect = getPanoramaDrawRect(info, item, maxWidth, region.y);
    ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片导出失败')), format, 0.92);
  });
}
