import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { organizePdf } from './pdfOrganizer';

describe('PDF page organization', () => {
  it('exports the selected order, preserving dimensions and combining rotations', async () => {
    const source = await PDFDocument.create();
    source.addPage([200, 300]);
    source.addPage([400, 500]).setRotation(degrees(90));
    const bytes = await organizePdf(await source.save(), [2, 1], { 2: 90 });
    const output = await PDFDocument.load(bytes);
    expect(output.getPage(0).getSize()).toEqual({ width: 400, height: 500 });
    expect(output.getPage(0).getRotation().angle).toBe(180);
    expect(output.getPage(1).getWidth()).toBe(200);
  });
  it('rejects empty selections instead of creating a blank PDF', async () => {
    const source = await PDFDocument.create(); source.addPage();
    await expect(organizePdf(await source.save(), [])).rejects.toThrow('至少保留一页');
  });
});
