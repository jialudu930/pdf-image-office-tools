import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export function drawRedaction(context, object, width, height) {
  const x = (object.x / 100) * width;
  const y = (object.y / 100) * height;
  const objectWidth = (object.width / 100) * width;
  const objectHeight = (object.height / 100) * height;
  context.save();
  context.globalAlpha = 1;
  context.fillStyle = object.color === '#ffffff' ? '#ffffff' : '#000000';
  context.fillRect(x, y, objectWidth, objectHeight);
  context.restore();
}

export function getExportableOcrWords(state) {
  if (state.objects.some((object) => object.type === 'redaction')) return [];
  return state.ocrWords || [];
}

export function getCenteredImageTransform(object, width, height) {
  const x = (object.x / 100) * width;
  const y = (object.y / 100) * height;
  const objectWidth = (object.width / 100) * width;
  const objectHeight = (object.height / 100) * height;
  return {
    centerX: x + objectWidth / 2,
    centerY: y + objectHeight / 2,
    objectWidth,
    objectHeight,
  };
}

async function drawObject(context, object, width, height) {
  const x = (object.x / 100) * width;
  const y = (object.y / 100) * height;
  const objectWidth = (object.width / 100) * width;
  if (object.type === 'redaction') {
    drawRedaction(context, object, width, height);
    return;
  }
  if (object.type === 'image' || object.type === 'stamp') {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = object.src;
    });
    context.save();
    context.globalAlpha = object.opacity ?? 1;
    const transform = getCenteredImageTransform(object, width, height);
    context.translate(transform.centerX, transform.centerY);
    context.rotate(((object.rotation || 0) * Math.PI) / 180);
    context.drawImage(
      image,
      -transform.objectWidth / 2,
      -transform.objectHeight / 2,
      transform.objectWidth,
      transform.objectHeight
    );
    context.restore();
    return;
  }
  context.save();
  context.globalAlpha = object.opacity ?? 1;
  const fontSize = (object.fontSize || 18) * (1.6 / 1.35);
  const objectHeight = (object.height / 100) * height;
  context.translate(x + objectWidth / 2, y + objectHeight / 2);
  context.rotate(((object.rotation || 0) * Math.PI) / 180);
  context.font = `${object.bold ? '700' : '400'} ${fontSize}px "Microsoft YaHei", sans-serif`;
  context.fillStyle = object.color || '#111827';
  context.textAlign = object.align || 'left';
  if (object.coverOriginal) {
    context.fillStyle = object.coverColor || '#ffffff';
    context.fillRect(-objectWidth / 2, -objectHeight / 2, objectWidth, objectHeight);
    context.fillStyle = object.color || '#111827';
  }
  const lines = String(object.text || '').split('\n');
  const textX = object.align === 'center' ? 0 : object.align === 'right' ? objectWidth / 2 - 4 : -objectWidth / 2 + 4;
  lines.forEach((line, index) => context.fillText(line, textX, -objectHeight / 2 + fontSize * (index + 1), objectWidth));
  context.restore();
}

export async function exportEditedPdf(pdf, pageStates, fileName = '已编辑.pdf') {
  const output = await PDFDocument.create();
  const latinFont = await output.embedFont(StandardFonts.Helvetica);

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const sourcePage = await pdf.getPage(pageNumber);
    const originalViewport = sourcePage.getViewport({ scale: 1 });
    const viewport = sourcePage.getViewport({ scale: 1.6 });
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = viewport.width;
    sourceCanvas.height = viewport.height;
    const sourceContext = sourceCanvas.getContext('2d', { alpha: false });
    await sourcePage.render({ canvasContext: sourceContext, viewport }).promise;

    const state = pageStates[pageNumber - 1];
    const crop = state.crop;
    const sx = crop.left * sourceCanvas.width;
    const sy = crop.top * sourceCanvas.height;
    const sw = (crop.right - crop.left) * sourceCanvas.width;
    const sh = (crop.bottom - crop.top) * sourceCanvas.height;
    const composite = document.createElement('canvas');
    composite.width = Math.max(1, Math.round(sw));
    composite.height = Math.max(1, Math.round(sh));
    const context = composite.getContext('2d');
    context.fillStyle = state.background || '#ffffff';
    context.fillRect(0, 0, composite.width, composite.height);
    context.filter = `grayscale(${state.scan.grayscale}%) contrast(${state.scan.contrast}%) brightness(${state.scan.brightness}%)`;
    context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, composite.width, composite.height);
    context.filter = 'none';

    for (const object of state.objects) {
      await drawObject(context, {
        ...object,
        x: ((object.x / 100 - crop.left) / (crop.right - crop.left)) * 100,
        y: ((object.y / 100 - crop.top) / (crop.bottom - crop.top)) * 100,
      }, composite.width, composite.height);
    }

    const png = await output.embedPng(composite.toDataURL('image/png'));
    const outputWidth = originalViewport.width * (crop.right - crop.left);
    const outputHeight = originalViewport.height * (crop.bottom - crop.top);
    const pdfPage = output.addPage([outputWidth, outputHeight]);
    pdfPage.drawImage(png, { x: 0, y: 0, width: outputWidth, height: outputHeight });
    getExportableOcrWords(state).filter((word) => /^[\x00-\x7F]+$/.test(word.text)).forEach((word) => {
      pdfPage.drawText(word.text, {
        x: Math.max(0, ((word.x || 0) / 100) * pdfPage.getWidth()),
        y: Math.max(0, pdfPage.getHeight() * (1 - (word.y || 0) / 100) - (word.fontSize || 8) / 1.35),
        size: Math.max(1, (word.fontSize || 8) / 1.35),
        font: latinFont,
        opacity: 0,
        color: rgb(1, 1, 1),
      });
    });
    sourceCanvas.width = 0;
    composite.width = 0;
  }
  return { bytes: await output.save(), fileName: /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf` };
}
