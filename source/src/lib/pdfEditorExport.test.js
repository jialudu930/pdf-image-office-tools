import { describe, expect, it, vi } from 'vitest';
import { drawRedaction, getCenteredImageTransform, getExportableOcrWords } from './pdfEditorExport';

describe('PDF editor image export', () => {
  it('rotates images and stamps around their visual center', () => {
    expect(getCenteredImageTransform({ x: 10, y: 20, width: 30, height: 15 }, 600, 800)).toEqual({
      centerX: 150,
      centerY: 220,
      objectWidth: 180,
      objectHeight: 120,
    });
  });
});

describe('PDF editor redaction export', () => {
  it.each(['#000000', '#ffffff'])('draws an opaque %s redaction rectangle', (color) => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      globalAlpha: 0.4,
      fillStyle: '',
    };

    drawRedaction(context, { x: 10, y: 20, width: 30, height: 15, color }, 600, 800);

    expect(context.save).toHaveBeenCalledOnce();
    expect(context.globalAlpha).toBe(1);
    expect(context.fillStyle).toBe(color);
    expect(context.fillRect).toHaveBeenCalledWith(60, 160, 180, 120);
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it('removes the hidden OCR layer from pages containing permanent redactions', () => {
    const words = [{ text: '13800138000', x: 10, y: 20 }];
    expect(getExportableOcrWords({ objects: [], ocrWords: words })).toEqual(words);
    expect(getExportableOcrWords({
      objects: [{ type: 'redaction', x: 8, y: 18, width: 30, height: 6 }],
      ocrWords: words,
    })).toEqual([]);
  });
});
