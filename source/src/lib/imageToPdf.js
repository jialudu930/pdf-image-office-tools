import { PDFDocument } from 'pdf-lib';

const A4_PORTRAIT = [595.28, 841.89];
const PAGE_MARGIN = 36;

export function toPdfFileName(name) {
  const base = name.replace(/\.(png|jpe?g|webp|gif|bmp)$/i, '') || '图片';
  return `${base}.pdf`;
}

export function getA4PageSize(width, height) {
  return width > height ? [A4_PORTRAIT[1], A4_PORTRAIT[0]] : [...A4_PORTRAIT];
}

export function fitInside(width, height, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * ratio * 100) / 100,
    height: Math.round(height * ratio * 100) / 100,
  };
}

async function imageInfoToPngBytes(info) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('图片内容无法读取'));
    element.src = info.previewUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = info.width;
  canvas.height = info.height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('图片转换失败');
  return blob.arrayBuffer();
}

export async function createImagePdf(info) {
  const pdf = await PDFDocument.create();
  const type = info.file.type.toLowerCase();
  let embedded;
  if (type === 'image/jpeg' || /\.jpe?g$/i.test(info.name)) {
    embedded = await pdf.embedJpg(await info.file.arrayBuffer());
  } else if (type === 'image/png' || /\.png$/i.test(info.name)) {
    embedded = await pdf.embedPng(await info.file.arrayBuffer());
  } else {
    embedded = await pdf.embedPng(await imageInfoToPngBytes(info));
  }

  const [pageWidth, pageHeight] = getA4PageSize(info.width, info.height);
  const page = pdf.addPage([pageWidth, pageHeight]);
  const size = fitInside(
    embedded.width,
    embedded.height,
    pageWidth - PAGE_MARGIN * 2,
    pageHeight - PAGE_MARGIN * 2
  );
  page.drawImage(embedded, {
    x: (pageWidth - size.width) / 2,
    y: (pageHeight - size.height) / 2,
    width: size.width,
    height: size.height,
  });
  return pdf.save();
}

