import { describe, expect, it } from 'vitest';
import {
  classifyConversionFile,
  createUniqueOutputNames,
  getConversionOutputName,
  getWorksheetBounds,
  paginateWorksheet,
  workbookToRenderModel,
  borderToCss,
  processConversionBatch,
  canAcceptConversionFiles,
} from './formatConversion';

describe('format conversion model', () => {
  it.each([
    ['photo.PNG', 'image'], ['photo.webp', 'image'], ['letter.DOCX', 'word'],
    ['table.XLS', 'excel'], ['table.xlsx', 'excel'], ['notes.txt', null],
  ])('classifies supported files', (name, expected) => {
    expect(classifyConversionFile(name)).toBe(expected);
  });

  it('creates PDF output names and resolves duplicate ZIP names', () => {
    expect(getConversionOutputName('quarterly.report.xlsx')).toBe('quarterly.report.pdf');
    expect(createUniqueOutputNames(['report.docx', 'report.xlsx', 'REPORT.XLS'])).toEqual([
      'report.pdf', 'report (2).pdf', 'REPORT (3).pdf',
    ]);
  });

  it('computes worksheet bounds and A4 landscape width-fit pagination', () => {
    const rows = [
      [{ value: 'A' }, { value: 'B' }],
      [{ value: 1 }, { value: 2 }],
      [{ value: 3 }, { value: 4 }],
      [{ value: 5 }, { value: 6 }],
    ];
    expect(getWorksheetBounds(rows)).toEqual({ rowCount: 4, columnCount: 2 });
    expect(paginateWorksheet({ contentWidth: 1200, contentHeight: 1500, pageWidth: 800, pageHeight: 500 })).toEqual({
      scale: 2 / 3, pageCount: 2, sliceHeight: 750,
    });
  });

  it('keeps workbook sheet order and cell presentation in the render model', () => {
    const workbook = {
      SheetNames: ['Summary', 'Detail'],
      Sheets: {
        Summary: {
          '!ref': 'A1:B2', '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }],
          '!cols': [{ wpx: 120 }, { wch: 15 }], '!rows': [{ hpx: 28 }],
          A1: { v: 'Report', w: 'Report', s: { font: { bold: true, name: 'Calibri', sz: 14, color: { rgb: 'FF0000' } }, fill: { fgColor: { rgb: 'FFFF00' } }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'medium', color: { rgb: '0000FF' } } } } },
          A2: { v: 3, f: '1+2', w: '3' }, B2: { v: new Date('2026-01-01'), w: '2026-01-01' },
        },
        Detail: { '!ref': 'A1', A1: { v: 'done' } },
      },
    };
    const model = workbookToRenderModel(workbook);
    expect(model.map((sheet) => sheet.name)).toEqual(['Summary', 'Detail']);
    expect(model[0]).toMatchObject({ merges: [{ startRow: 0, startColumn: 0, rowSpan: 1, columnSpan: 2 }], columnWidths: [120, 120], rowHeights: [28, 24] });
    expect(model[0].rows[0][0]).toMatchObject({ display: 'Report', colSpan: 2, style: { bold: true, fontName: 'Calibri', fontSize: 14, color: '#FF0000', fill: '#FFFF00', horizontal: 'center', borderBottom: { style: 'medium', color: '#0000FF' } } });
    expect(model[0].rows[1][0]).toMatchObject({ value: 3, formula: '1+2', display: '3' });
  });

  it.each([
    [{ style: 'thin', color: '#111111' }, '1px solid #111111'],
    [{ style: 'medium', color: '#222222' }, '2px solid #222222'],
    [{ style: 'thick' }, '3px solid #cbd5e1'],
    [{ style: 'dashed' }, '1px dashed #cbd5e1'],
    [{ style: 'dotted' }, '1px dotted #cbd5e1'],
    [{ style: 'double' }, '3px double #cbd5e1'],
  ])('maps spreadsheet borders to CSS', (border, expected) => {
    expect(borderToCss(border)).toBe(expected);
  });

  it('continues a conversion batch after individual failures and reports both groups', async () => {
    const result = await processConversionBatch(['good-a', 'bad', 'good-b'], async (item) => {
      if (item === 'bad') throw new Error('broken');
      return `${item}.pdf`;
    });
    expect(result.successes).toEqual([{ item: 'good-a', result: 'good-a.pdf' }, { item: 'good-b', result: 'good-b.pdf' }]);
    expect(result.failures).toMatchObject([{ item: 'bad', error: { message: 'broken' } }]);
  });

  it('rejects queue mutations while a conversion lock is active', () => {
    expect(canAcceptConversionFiles(false)).toBe(true);
    expect(canAcceptConversionFiles(true)).toBe(false);
  });

  it('normalizes non-A1 sheet coordinates and offsets row and column metadata', () => {
    const [sheet] = workbookToRenderModel({ SheetNames: ['Offset'], Sheets: { Offset: {
      '!ref': 'C5:E6',
      '!merges': [{ s: { r: 4, c: 2 }, e: { r: 4, c: 3 } }],
      '!cols': [{ wpx: 10 }, { wpx: 20 }, { wpx: 130 }, { wpx: 140 }, { wpx: 150 }],
      '!rows': [{ hpx: 10 }, {}, {}, {}, { hpx: 35 }, { hpx: 40 }],
      C5: { v: 'start' }, E6: { v: 'end' },
    } } });
    expect(sheet.merges).toEqual([{ startRow: 0, startColumn: 0, rowSpan: 1, columnSpan: 2 }]);
    expect(sheet.columnWidths).toEqual([130, 140, 150]);
    expect(sheet.rowHeights).toEqual([35, 40]);
    expect(sheet.rows[0][0].display).toBe('start');
    expect(sheet.rows[0][0]).toMatchObject({ rowSpan: 1, colSpan: 2 });
    expect(sheet.rows[1][2].display).toBe('end');
  });
});
