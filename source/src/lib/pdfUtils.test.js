import { describe, expect, it } from 'vitest';
import { calculateVerticalPageSlices, sanitizeWordHtml } from './pdfUtils';

describe('sanitizeWordHtml', () => {
  it('removes executable markup, event handlers and remote resources while keeping data images', () => {
    const html = '<style>body{display:none}</style><script>alert(1)</script><iframe src="https://evil.test"></iframe><video poster="//evil.test/poster.png"></video><p style="background:url(https://evil.test/a)" onclick="steal()"><a href="#safe" xlink:href="https://evil.test">bad</a><img srcset="https://evil.test/a.png 2x" src="https://evil.test/a.png"><img style="color:red" src="data:image/png;base64,abc"></p>';
    const safe = sanitizeWordHtml(html);
    expect(safe).not.toMatch(/script|style=|iframe|onclick|https?:|href=|srcset|poster|xlink/i);
    expect(safe).toContain('data:image/png;base64,abc');
  });
});

describe('calculateVerticalPageSlices', () => {
  it('splits a tall rendered Word document into consecutive A4 content slices', () => {
    expect(calculateVerticalPageSlices({
      sourceWidth: 1428,
      sourceHeight: 5000,
      targetWidth: 515,
      targetHeight: 762,
    })).toEqual([
      { y: 0, height: 2113 },
      { y: 2113, height: 2113 },
      { y: 4226, height: 774 },
    ]);
  });

  it('returns one unscaled slice for short content', () => {
    expect(calculateVerticalPageSlices({
      sourceWidth: 714,
      sourceHeight: 600,
      targetWidth: 515,
      targetHeight: 762,
    })).toEqual([{ y: 0, height: 600 }]);
  });
});
