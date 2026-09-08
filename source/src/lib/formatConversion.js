export function classifyConversionFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name || '';
  if (/\.(png|jpe?g|webp)$/i.test(name)) return 'image';
  if (/\.docx$/i.test(name)) return 'word';
  if (/\.xlsx?$/i.test(name)) return 'excel';
  return null;
}

export function canAcceptConversionFiles(converting) {
  return !converting;
}

export function getConversionOutputName(name) {
  return String(name).replace(/\.[^.]+$/, '') + '.pdf';
}

export function createUniqueOutputNames(names) {
  const used = new Set();
  return names.map((name) => {
    const output = getConversionOutputName(name);
    const base = output.slice(0, -4);
    let candidate = output;
    let index = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base} (${index++}).pdf`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function getWorksheetBounds(rows) {
  return {
    rowCount: rows.length,
    columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
  };
}

export function paginateWorksheet({ contentWidth, contentHeight, pageWidth, pageHeight }) {
  const scale = Math.min(1, pageWidth / Math.max(1, contentWidth));
  const sliceHeight = pageHeight / scale;
  return { scale, pageCount: Math.max(1, Math.ceil(contentHeight / sliceHeight)), sliceHeight };
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value) {
    name = String.fromCharCode(65 + (value - 1) % 26) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function colorValue(color) {
  return color?.rgb ? `#${color.rgb.slice(-6)}` : undefined;
}

function borderValue(border) {
  return border?.style ? { style: border.style, color: colorValue(border.color) } : undefined;
}

export function borderToCss(border) {
  if (!border?.style) return '1px solid #cbd5e1';
  const widths = { medium: 2, thick: 3, double: 3 };
  const cssStyle = ['dashed', 'dotted', 'double'].includes(border.style) ? border.style : 'solid';
  return `${widths[border.style] || 1}px ${cssStyle} ${border.color || '#cbd5e1'}`;
}

export async function processConversionBatch(items, converter, onProgress) {
  const successes = [];
  const failures = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    onProgress?.(item, index, items.length);
    try {
      successes.push({ item, result: await converter(item, index) });
    } catch (error) {
      failures.push({ item, error });
    }
  }
  return { successes, failures };
}

function cellStyle(style = {}) {
  return {
    bold: Boolean(style.font?.bold),
    italic: Boolean(style.font?.italic),
    fontName: style.font?.name,
    fontSize: style.font?.sz,
    color: colorValue(style.font?.color),
    fill: colorValue(style.fill?.fgColor),
    horizontal: style.alignment?.horizontal,
    vertical: style.alignment?.vertical,
    wrapText: Boolean(style.alignment?.wrapText),
    borderTop: borderValue(style.border?.top),
    borderRight: borderValue(style.border?.right),
    borderBottom: borderValue(style.border?.bottom),
    borderLeft: borderValue(style.border?.left),
  };
}

export function workbookToRenderModel(workbook) {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = sheet['!ref'] || 'A1:A1';
    const [start, end] = range.split(':');
    const address = (value) => {
      const match = /^([A-Z]+)(\d+)$/i.exec(value);
      const column = [...match[1].toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      return { row: Number(match[2]) - 1, column };
    };
    const from = address(start);
    const to = address(end || start);
    if ((to.row - from.row + 1) * (to.column - from.column + 1) > 200000) throw new Error(`工作表“${name}”范围过大，请清除多余空白行列后重试`);
    const merges = (sheet['!merges'] || []).map((merge) => ({
      startRow: merge.s.r - from.row, startColumn: merge.s.c - from.column,
      rowSpan: merge.e.r - merge.s.r + 1, columnSpan: merge.e.c - merge.s.c + 1,
    }));
    const mergeStarts = new Map(merges.map((merge) => [`${merge.startRow}:${merge.startColumn}`, merge]));
    const rows = [];
    for (let row = from.row; row <= to.row; row += 1) {
      const cells = [];
      for (let column = from.column; column <= to.column; column += 1) {
        const source = sheet[`${columnName(column)}${row + 1}`] || {};
        const merge = mergeStarts.get(`${row - from.row}:${column - from.column}`);
        cells.push({
          value: source.v,
          formula: source.f,
          display: source.w ?? (source.v == null ? '' : String(source.v)),
          rowSpan: merge?.rowSpan,
          colSpan: merge?.columnSpan,
          style: cellStyle(source.s),
        });
      }
      rows.push(cells);
    }
    return {
      name,
      rows,
      merges,
      columnWidths: Array.from({ length: to.column - from.column + 1 }, (_, index) => {
        const column = sheet['!cols']?.[from.column + index];
        return column?.wpx || (column?.wch ? column.wch * 8 : 96);
      }),
      rowHeights: Array.from({ length: to.row - from.row + 1 }, (_, index) => sheet['!rows']?.[from.row + index]?.hpx || 24),
    };
  });
}

export async function parseWorkbookFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: true });
  return workbookToRenderModel(workbook);
}

function renderSheetTable(sheet) {
  const wrapper = document.createElement('section');
  wrapper.style.cssText = 'position:fixed;left:-100000px;top:0;background:white;padding:24px;color:#111827;font-family:Arial,sans-serif;';
  const title = document.createElement('h2');
  title.textContent = sheet.name;
  title.style.cssText = 'font-size:20px;margin:0 0 12px;';
  wrapper.appendChild(title);
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;table-layout:fixed;';
  const covered = new Set();
  sheet.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    tr.style.height = `${sheet.rowHeights[rowIndex]}px`;
    row.forEach((cell, columnIndex) => {
      if (covered.has(`${rowIndex}:${columnIndex}`)) return;
      const td = document.createElement('td');
      td.textContent = cell.display;
      td.style.cssText = `box-sizing:border-box;width:${sheet.columnWidths[columnIndex]}px;min-width:${sheet.columnWidths[columnIndex]}px;padding:4px 6px;border:1px solid #cbd5e1;white-space:${cell.style.wrapText ? 'normal' : 'nowrap'};overflow:hidden;`;
      if (cell.style.bold) td.style.fontWeight = '700';
      if (cell.style.italic) td.style.fontStyle = 'italic';
      if (cell.style.fontName) td.style.fontFamily = cell.style.fontName;
      if (cell.style.fontSize) td.style.fontSize = `${cell.style.fontSize}pt`;
      if (cell.style.color) td.style.color = cell.style.color;
      if (cell.style.fill) td.style.backgroundColor = cell.style.fill;
      if (cell.style.horizontal) td.style.textAlign = cell.style.horizontal;
      if (cell.style.vertical) td.style.verticalAlign = cell.style.vertical;
      td.style.borderTop = borderToCss(cell.style.borderTop);
      td.style.borderRight = borderToCss(cell.style.borderRight);
      td.style.borderBottom = borderToCss(cell.style.borderBottom);
      td.style.borderLeft = borderToCss(cell.style.borderLeft);
      if (cell.rowSpan) td.rowSpan = cell.rowSpan;
      if (cell.colSpan) td.colSpan = cell.colSpan;
      if (cell.rowSpan || cell.colSpan) {
        for (let r = rowIndex; r < rowIndex + (cell.rowSpan || 1); r += 1) {
          for (let c = columnIndex; c < columnIndex + (cell.colSpan || 1); c += 1) {
            if (r !== rowIndex || c !== columnIndex) covered.add(`${r}:${c}`);
          }
        }
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  wrapper.appendChild(table);
  document.body.appendChild(wrapper);
  return wrapper;
}

export async function convertExcelToPdf(file) {
  const sheets = await parseWorkbookFile(file);
  const pdf = await PDFDocument.create();
  const [portraitWidth, portraitHeight] = PageSizes.A4;
  const pageWidth = portraitHeight;
  const pageHeight = portraitWidth;
  const margin = 28;
  for (const sheet of sheets) {
    const element = renderSheetTable(sheet);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (element.scrollHeight > 16000 || element.scrollWidth > 16000) throw new Error('表格过大，请按工作表拆分后转换');
      const dataUrl = await toPng(element, { pixelRatio: Math.min(1.5, 16000 / Math.max(element.scrollHeight, element.scrollWidth, 1)), skipFonts: true, backgroundColor: '#ffffff', style: { position: 'static', left: 'auto', top: 'auto' } });
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = dataUrl; });
      const layout = paginateWorksheet({
        contentWidth: image.naturalWidth,
        contentHeight: image.naturalHeight,
        pageWidth: pageWidth - margin * 2,
        pageHeight: pageHeight - margin * 2,
      });
      for (let pageIndex = 0; pageIndex < layout.pageCount; pageIndex += 1) {
        const sourceY = Math.floor(pageIndex * layout.sliceHeight);
        const sourceHeight = Math.min(Math.ceil(layout.sliceHeight), image.naturalHeight - sourceY);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = sourceHeight;
        canvas.getContext('2d').drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, 0, 0, image.naturalWidth, sourceHeight);
        const embedded = await pdf.embedPng(canvas.toDataURL('image/png'));
        const page = pdf.addPage([pageWidth, pageHeight]);
        page.drawImage(embedded, { x: margin, y: pageHeight - margin - sourceHeight * layout.scale, width: image.naturalWidth * layout.scale, height: sourceHeight * layout.scale });
      }
    } finally {
      element.remove();
    }
  }
  return { name: getConversionOutputName(file.name), bytes: await pdf.save(), pageCount: pdf.getPageCount() };
}
import * as XLSX from 'xlsx';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { toPng } from 'html-to-image';
