import { PDFDocument, PageSizes } from 'pdf-lib';
import mammoth from 'mammoth';
import { toPng } from 'html-to-image';

export function calculateVerticalPageSlices({ sourceWidth, sourceHeight, targetWidth, targetHeight }) {
  const pageSourceHeight = Math.max(1, Math.ceil((targetHeight * sourceWidth) / targetWidth));
  const slices = [];
  for (let y = 0; y < sourceHeight; y += pageSourceHeight) {
    slices.push({ y, height: Math.min(pageSourceHeight, sourceHeight - y) });
  }
  return slices.length ? slices : [{ y: 0, height: 1 }];
}

function loadDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

export function sanitizeWordHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script,style,iframe,object,embed').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name === 'style') node.removeAttribute(attribute.name);
      if (name.startsWith('on')) node.removeAttribute(attribute.name);
      if (['href', 'srcset', 'poster', 'xlink:href'].includes(name)) node.removeAttribute(attribute.name);
      if (name === 'src' && (node.tagName !== 'IMG' || !/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(value))) node.removeAttribute(attribute.name);
    });
  });
  return template.innerHTML;
}

export async function getPdfInfo(file) {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  return {
    name: file.name,
    type: 'pdf',
    pageCount: pdfDoc.getPageCount(),
    bytes,
    id: Date.now() + Math.random(),
  };
}

export async function convertWordToPdf(file) {
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;padding:40px;font-family:Arial,sans-serif;line-height:1.6;color:#333;';
  div.innerHTML = `<div style="width:714px">${sanitizeWordHtml(result.value)}</div>`;
  document.body.appendChild(div);
  let dataUrl;
  try {
    await new Promise(r => setTimeout(r, 500));
    await document.fonts?.ready;
    await Promise.all([...div.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
    const height = div.scrollHeight;
    if (height > 16000) throw new Error('Word 文档过长，请拆成较短文件后转换');
    dataUrl = await toPng(div, { pixelRatio: Math.min(2, 16000 / Math.max(1, height)), skipFonts: true, style: { position: 'static', left: 'auto', top: 'auto' } });
  } finally {
    div.remove();
  }

  const pdfDoc = await PDFDocument.create();
  const image = await loadDataUrlImage(dataUrl);
  const [pageWidth, pageHeight] = PageSizes.A4;
  const targetWidth = pageWidth - 80;
  const targetHeight = pageHeight - 80;
  const slices = calculateVerticalPageSlices({
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight,
    targetWidth,
    targetHeight,
  });
  for (const slice of slices) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = slice.height;
    canvas.getContext('2d').drawImage(
      image,
      0,
      slice.y,
      image.naturalWidth,
      slice.height,
      0,
      0,
      image.naturalWidth,
      slice.height
    );
    const img = await pdfDoc.embedPng(canvas.toDataURL('image/png'));
    const page = pdfDoc.addPage(PageSizes.A4);
    const drawnHeight = (slice.height / image.naturalWidth) * targetWidth;
    page.drawImage(img, {
      x: 40,
      y: pageHeight - 40 - drawnHeight,
      width: targetWidth,
      height: drawnHeight,
    });
  }

  return {
    name: file.name.replace(/\.docx?$/i, '.pdf'),
    type: 'word-converted',
    pageCount: slices.length,
    bytes: await pdfDoc.save(),
    id: Date.now() + Math.random(),
  };
}

export async function mergeDocuments(docs, excludedPages = new Set()) {
  const merged = await PDFDocument.create();
  let outputPageNumber = 0;
  for (const doc of docs) {
    const src = await PDFDocument.load(doc.bytes);
    const keptIndices = src.getPageIndices().filter(() => {
      outputPageNumber += 1;
      return !excludedPages.has(outputPageNumber);
    });
    const pages = await merged.copyPages(src, keptIndices);
    pages.forEach(p => merged.addPage(p));
  }
  return merged.save();
}

export async function removePdfPages(bytes, deletedPages) {
  const source = await PDFDocument.load(bytes);
  const output = await PDFDocument.create();
  const keptIndices = source.getPageIndices()
    .filter((index) => !deletedPages.has(index + 1));
  const pages = await output.copyPages(source, keptIndices);
  pages.forEach((page) => output.addPage(page));
  return output.save();
}
