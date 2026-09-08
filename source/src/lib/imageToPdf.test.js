import { describe, expect, it } from 'vitest';
import { fitInside, getA4PageSize, toPdfFileName } from './imageToPdf';

describe('image to PDF helpers', () => {
  it('replaces the image extension with pdf', () => {
    expect(toPdfFileName('合同首页.JPEG')).toBe('合同首页.pdf');
    expect(toPdfFileName('发票.png')).toBe('发票.pdf');
  });

  it('uses landscape A4 for landscape images', () => {
    expect(getA4PageSize(1600, 900)).toEqual([841.89, 595.28]);
    expect(getA4PageSize(900, 1600)).toEqual([595.28, 841.89]);
  });

  it('fits an image proportionally without cropping', () => {
    expect(fitInside(1000, 500, 500, 500)).toEqual({ width: 500, height: 250 });
    expect(fitInside(500, 1000, 500, 500)).toEqual({ width: 250, height: 500 });
  });
});
