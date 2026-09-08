import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULL_CROP, adjustCrop, createPanoramaLayout, getCropOutputHeight, getPanoramaDrawRect, getPanoramaPreviewScale, mergeImages, quantizePanoramaRegions, updatePanoramaCrop, validateCanvasSize } from './imageUtils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('panorama geometry', () => {
  const images = [
    { id: 'a', width: 800, height: 600 },
    { id: 'b', width: 1000, height: 500 },
    { id: 'c', width: 400, height: 800 },
  ];

  it('creates full-image crops and keeps natural stitch ratios without slider state', () => {
    const layout = createPanoramaLayout(images);
    expect(layout.width).toBe(1000);
    expect(layout.items.map((item) => item.regionHeight)).toEqual([750, 500, 2000]);
    expect(layout.height).toBe(3250);
    expect(layout.items[0]).toMatchObject({ crop: FULL_CROP, sourceWidth: 800, sourceHeight: 600 });
    expect(layout.items[0]).not.toHaveProperty('zoom');
    expect(layout.items[0]).not.toHaveProperty('positionX');
  });

  it('updates a crop and automatically recalculates its stitched height', () => {
    const layout = createPanoramaLayout(images.slice(0, 2));
    const crop = { left: .25, top: .25, right: .75, bottom: .5 };
    const changed = updatePanoramaCrop(layout, 'a', crop);
    expect(changed.items[0]).toMatchObject({ crop, regionHeight: 375 });
    expect(updatePanoramaCrop(changed, 'a', FULL_CROP).items[0]).toMatchObject({ crop: FULL_CROP, regionHeight: 750 });
  });

  it('uses the normalized crop as the exact source and fills the destination without white edges', () => {
    expect(getPanoramaDrawRect(images[0], {
      crop: { left: .25, top: .25, right: .75, bottom: .5 },
      regionHeight: 375,
    }, 1000, 12)).toEqual({ sx: 200, sy: 150, sw: 400, sh: 150, dx: 0, dy: 12, dw: 1000, dh: 375 });
  });

  it('rejects unsafe canvas dimensions', () => {
    expect(() => validateCanvasSize(40000, 100)).toThrow('画布尺寸超过浏览器安全上限');
    expect(() => validateCanvasSize(8192, 8192)).toThrow('画布尺寸超过浏览器安全上限');
    expect(() => validateCanvasSize(4000, 4000)).not.toThrow();
  });

  it('reports an explicit error when a 2D canvas context is unavailable', async () => {
    vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => null });
    vi.stubGlobal('Image', class {
      set src(value) { this.currentSrc = value; this.onload(); }
    });
    await expect(mergeImages([{ width: 1, height: 1, previewUrl: 'blob:a' }], 'image/png', {
      width: 1,
      height: 1,
      items: [{ regionHeight: 1 }],
    })).rejects.toThrow('当前浏览器无法创建图片画布');
  });

  it('caps preview dimensions without changing the export layout', () => {
    expect(getPanoramaPreviewScale(8000, 8000, 1)).toBeCloseTo(0.2);
    expect(getPanoramaPreviewScale(1000, 2000, .5)).toBe(.5);
  });

  it('quantizes fractional regions into contiguous integer pixels ending exactly at canvas height', () => {
    const result = quantizePanoramaRegions([{ regionHeight: 500.25 }, { regionHeight: 500.25 }, { regionHeight: 250 }]);
    expect(result).toEqual({
      height: 1251,
      regions: [{ y: 0, height: 500 }, { y: 500, height: 501 }, { y: 1001, height: 250 }],
    });
    result.regions.slice(1).forEach((region, index) => {
      expect(region.y).toBe(result.regions[index].y + result.regions[index].height);
    });
    const last = result.regions.at(-1);
    expect(last.y + last.height).toBe(result.height);
  });
});

describe('normalized crop geometry', () => {
  it('uses the whole source image as the immutable default crop', () => {
    expect(FULL_CROP).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
    expect(Object.isFrozen(FULL_CROP)).toBe(true);
  });

  it.each([
    ['n', { left: .2, top: .3, right: .8, bottom: .8 }],
    ['s', { left: .2, top: .2, right: .8, bottom: .9 }],
    ['e', { left: .2, top: .2, right: .9, bottom: .8 }],
    ['w', { left: .3, top: .2, right: .8, bottom: .8 }],
    ['nw', { left: .3, top: .3, right: .8, bottom: .8 }],
    ['ne', { left: .2, top: .3, right: .9, bottom: .8 }],
    ['sw', { left: .3, top: .2, right: .8, bottom: .9 }],
    ['se', { left: .2, top: .2, right: .9, bottom: .9 }],
  ])('resizes the %s edge or corner', (handle, expected) => {
    expect(adjustCrop({ left: .2, top: .2, right: .8, bottom: .8 }, handle, { x: .1, y: .1 })).toEqual(expected);
  });

  it('moves without changing size and clamps the whole crop inside the image', () => {
    expect(adjustCrop({ left: .1, top: .2, right: .5, bottom: .6 }, 'move', { x: .7, y: .7 })).toEqual({
      left: .6, top: .6, right: 1, bottom: 1,
    });
  });

  it('enforces minimum crop size and clamps resize handles to image bounds', () => {
    expect(adjustCrop({ left: .2, top: .2, right: .8, bottom: .8 }, 'nw', { x: 2, y: -2 }, .05)).toEqual({
      left: .75, top: 0, right: .8, bottom: .8,
    });
  });

  it('derives stitched height from the crop aspect ratio without distortion', () => {
    expect(getCropOutputHeight({ width: 800, height: 600 }, { left: .25, top: .25, right: .75, bottom: .75 }, 1000)).toBe(750);
  });
});
