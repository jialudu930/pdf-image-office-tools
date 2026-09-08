import { describe, expect, it } from 'vitest';
import { createRedactionFromPoints, normalizeCrop, parsePageRange, pushHistory } from './pdfEditorModel';

describe('PDF editor model', () => {
  it('parses page ranges and removes duplicates', () => {
    expect(parsePageRange('1,3-5,4', 6)).toEqual([1, 3, 4, 5]);
    expect(parsePageRange('全部', 3)).toEqual([1, 2, 3]);
  });

  it('keeps crop inside normalized page bounds', () => {
    expect(normalizeCrop({ left: -0.2, top: 0.1, right: 1.2, bottom: 0.9 }))
      .toEqual({ left: 0, top: 0.1, right: 1, bottom: 0.9 });
  });

  it('bounds the undo history', () => {
    const history = Array.from({ length: 50 }, (_, index) => index);
    expect(pushHistory(history, 50, 20)).toEqual(Array.from({ length: 20 }, (_, index) => index + 31));
  });

  it('creates normalized redactions from forward and reverse drags', () => {
    expect(createRedactionFromPoints({ x: 10, y: 20 }, { x: 35, y: 45 }, { id: 'mask-1' }))
      .toEqual({ id: 'mask-1', type: 'redaction', x: 10, y: 20, width: 25, height: 25, color: '#000000' });
    expect(createRedactionFromPoints({ x: 35, y: 45 }, { x: 10, y: 20 }, { id: 'mask-2', color: '#ffffff' }))
      .toEqual({ id: 'mask-2', type: 'redaction', x: 10, y: 20, width: 25, height: 25, color: '#ffffff' });
  });

  it('clamps redactions to the page and ignores accidental taps', () => {
    expect(createRedactionFromPoints({ x: -10, y: 95 }, { x: 110, y: 120 }, { id: 'mask-3' }))
      .toEqual({ id: 'mask-3', type: 'redaction', x: 0, y: 95, width: 100, height: 5, color: '#000000' });
    expect(createRedactionFromPoints({ x: 10, y: 10 }, { x: 10.4, y: 11 }, { id: 'mask-4' }))
      .toBeNull();
  });
});
