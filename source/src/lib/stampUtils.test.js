import { describe, expect, it } from 'vitest';
import {
  calculateStampHeight,
  calculateScaledDimensions,
  calculateSeamSliceWidthPercent,
  createSeamGroupLayouts,
  calculateVerticalSliceRegions,
  clampObjectPosition,
  copyStamp,
  createSeamStampLayout,
  insertSeamStampObjects,
  isSupportedEditorFile,
  createStampObject,
  normalizeWhiteRemovalStrength,
  parseStampSizeDraft,
  resizeStampFromCorner,
  removeWhitePixels,
  moveSeamStampGroup,
  getStampBatchSizeLimit,
  updateStampBatchSize,
  updateStampOnPage,
  validateSeamPageRange,
} from './stampUtils';

describe('PDF workbench geometry helpers', () => {
  it.each([
    ['contract.PDF', true],
    ['contract.docx', true],
    ['contract.DOCX', true],
    ['stamp.png', false],
  ])('validates supported editor filenames case-insensitively', (name, expected) => {
    expect(isSupportedEditorFile(name)).toBe(expected);
  });

  it('creates left seam layouts and retains the side during batch resizing', () => {
    const [slice] = createSeamStampLayout([1], {
      width: 8, height: 20, side: 'left', groupId: 'left-group',
    });
    expect(slice).toMatchObject({ x: -4, seamSide: 'left' });
    const pages = [{ objects: [{
      ...slice, id: 'left', type: 'stamp', seamStamp: true, stampBatchId: 'batch-a',
    }] }];
    expect(updateStampBatchSize(pages, 'batch-a', 30)[0].objects[0]).toMatchObject({
      x: -6, width: 12, height: 30, seamSide: 'left',
    });
  });

  it('proportionally resizes from a corner while preserving the opposite anchor', () => {
    const object = { x: 20, y: 30, width: 40, height: 20 };
    expect(resizeStampFromCorner(object, 'top-left', { x: 0, y: 20 })).toEqual({
      x: 0, y: 20, width: 60, height: 30,
    });
    expect(resizeStampFromCorner(object, 'bottom-right', { x: 80, y: 40 })).toEqual({
      x: 20, y: 30, width: 60, height: 30,
    });
  });

  it('clamps a corner resize to the linked batch limit without moving the opposite anchor', () => {
    const object = { x: 20, y: 30, width: 40, height: 20 };
    expect(resizeStampFromCorner(object, 'top-left', { x: 0, y: 0 }, 5, 25)).toEqual({
      x: 10, y: 25, width: 50, height: 25,
    });
  });
});

describe('parseStampSizeDraft', () => {
  it.each([
    ['', 60, null],
    ['not-a-number', 60, null],
    ['24', 60, 24],
    ['3', 60, 5],
    ['90', 33, 33],
  ])('parses a size draft safely', (draft, max, expected) => {
    expect(parseStampSizeDraft(draft, max)).toBe(expected);
  });
});

describe('copyStamp', () => {
  it('copies an ordinary stamp on the current page as an independent offset stamp', () => {
    const source = {
      id: 'ordinary', type: 'stamp', src: 'stamp.png', originalSrc: 'original.png',
      stampBatchId: 'old-batch', x: 78, y: 84, width: 20, height: 15,
      rotation: 12, opacity: 0.72, whiteRemovalStrength: 55,
    };
    const pages = [{ objects: [source] }, { objects: [] }];
    const result = copyStamp(pages, 0, 'ordinary', {
      objectId: 'ordinary-copy', batchId: 'new-batch', offset: 5,
    });

    expect(result.selectedId).toBe('ordinary-copy');
    expect(result.pageStates[0].objects).toHaveLength(2);
    expect(result.pageStates[0].objects[1]).toMatchObject({
      ...source, id: 'ordinary-copy', stampBatchId: 'new-batch', x: 53, y: 84,
    });
    expect(result.pageStates[0].objects[1]).not.toHaveProperty('seamStamp');
    expect(result.pageStates[0].objects[1]).not.toHaveProperty('seamGroupId');
    expect(result.pageStates[1]).toBe(pages[1]);
    expect(pages[0].objects).toEqual([source]);
  });

  it('rejects an ordinary copy atomically when no non-overlapping page position exists', () => {
    const pages = [{ objects: [
      { id: 'selected', type: 'stamp', x: 10, y: 10, width: 20, height: 20 },
      { id: 'blocker', type: 'redaction', x: 0, y: 0, width: 100, height: 100 },
    ] }];
    expect(() => copyStamp(pages, 0, 'selected', {
      objectId: 'copy', batchId: 'new-batch', offset: 5,
    })).toThrow('页面没有足够空间复制签章');
    expect(pages[0].objects).toHaveLength(2);
  });

  it('copies every slice of the selected seam group with new ids and a common available offset', () => {
    const pages = [1, 2, 3].map((pageNumber, index) => ({ objects: [{
      id: `slice-${index}`, type: 'stamp', src: `slice-${index}.png`, seamStamp: true,
      seamGroupId: 'old-group', stampBatchId: 'old-batch', pageNumber,
      sliceIndex: index, sliceCount: 3, x: 96, y: 20, width: 8, height: 20, opacity: 0.8,
    }] }));
    const result = copyStamp(pages, 1, 'slice-1', {
      objectIds: ['copy-0', 'copy-1', 'copy-2'],
      batchId: 'new-batch', seamGroupId: 'new-group', offset: 5,
    });

    expect(result.selectedId).toBe('copy-1');
    result.pageStates.forEach((page, index) => {
      expect(page.objects[1]).toMatchObject({
        id: `copy-${index}`, src: `slice-${index}.png`, seamStamp: true,
        seamGroupId: 'new-group', stampBatchId: 'new-batch', y: 40,
        sliceIndex: index, sliceCount: 3, opacity: 0.8,
      });
    });
  });

  it('finds the nearest upward offset when the preferred downward position overlaps', () => {
    const pages = [{ objects: [
      { id: 'selected', type: 'stamp', seamStamp: true, seamGroupId: 'old', y: 40, height: 20 },
      { id: 'blocker', type: 'stamp', seamStamp: true, seamGroupId: 'other', y: 60, height: 40 },
    ] }];
    const result = copyStamp(pages, 0, 'selected', {
      objectIds: ['copy'], batchId: 'new-batch', seamGroupId: 'new-group', offset: 5,
    });
    expect(result.pageStates[0].objects[2].y).toBe(20);
  });

  it('allows copied seam groups on opposite sides to share the same vertical space', () => {
    const pages = [{ objects: [
      { id: 'selected', type: 'stamp', seamStamp: true, seamSide: 'left', seamGroupId: 'left', y: 20, height: 20 },
      { id: 'right-blocker', type: 'stamp', seamStamp: true, seamSide: 'right', seamGroupId: 'right', y: 40, height: 60 },
    ] }];
    const result = copyStamp(pages, 0, 'selected', {
      objectIds: ['copy'], batchId: 'new-batch', seamGroupId: 'left-copy', offset: 5,
    });
    expect(result.pageStates[0].objects[2]).toMatchObject({ y: 40, seamSide: 'left' });
  });

  it('throws atomically when no vertical position can hold the copied seam group', () => {
    const pages = [{ objects: [
      { id: 'selected', type: 'stamp', seamStamp: true, seamGroupId: 'old', y: 0, height: 50 },
      { id: 'blocker', type: 'stamp', seamStamp: true, seamGroupId: 'other', y: 50, height: 50 },
    ] }];
    expect(() => copyStamp(pages, 0, 'selected', {
      objectIds: ['copy'], batchId: 'new-batch', seamGroupId: 'new-group', offset: 5,
    })).toThrow('没有足够空间复制整组骑缝章');
    expect(pages[0].objects).toHaveLength(2);
  });
});

describe('updateStampBatchSize', () => {
  it('resizes the ordinary stamp and every seam slice in one batch proportionally', () => {
    const pages = [
      { objects: [{ id: 'ordinary', type: 'stamp', stampBatchId: 'batch-a', width: 20, height: 10, x: 10, y: 15 }] },
      { objects: [{ id: 'slice-1', type: 'stamp', seamStamp: true, stampBatchId: 'batch-a', width: 8, height: 10, x: 96, y: 30 }] },
      { objects: [
        { id: 'slice-2', type: 'stamp', seamStamp: true, stampBatchId: 'batch-a', width: 8, height: 10, x: 96, y: 30 },
        { id: 'other', type: 'stamp', stampBatchId: 'batch-b', width: 12, height: 10, x: 20, y: 20 },
      ] },
    ];
    const next = updateStampBatchSize(pages, 'batch-a', 20);
    expect(next[0].objects[0]).toMatchObject({ width: 40, height: 20, x: 10, y: 15 });
    expect(next[1].objects[0]).toMatchObject({ width: 16, height: 20, x: 92, y: 30 });
    expect(next[2].objects[0]).toMatchObject({ width: 16, height: 20, x: 92, y: 30 });
    expect(next[2].objects[1]).toBe(pages[2].objects[1]);
    expect(pages[0].objects[0].height).toBe(10);
  });

  it('rejects invalid full heights', () => {
    expect(() => updateStampBatchSize([], 'batch-a', Number.NaN)).toThrow('签章高度无效');
    expect(() => updateStampBatchSize([], 'batch-a', 0)).toThrow('签章高度无效');
  });

  it('keeps an ordinary stamp inside the bottom page edge', () => {
    const pages = [{ objects: [{ id: 'ordinary', stampBatchId: 'batch-a', width: 20, height: 10, x: 10, y: 85 }] }];
    const next = updateStampBatchSize(pages, 'batch-a', 30);
    expect(next[0].objects[0]).toMatchObject({ height: 30, y: 70 });
  });

  it('reflows three seam groups without overlap and preserves matching y across pages', () => {
    const pages = [0, 1].map((pageIndex) => ({ objects: [0, 1, 2].map((groupIndex) => ({
      id: `${pageIndex}-${groupIndex}`,
      stampBatchId: 'batch-a',
      seamStamp: true,
      seamGroupId: `group-${groupIndex}`,
      width: 4,
      height: 10,
      x: 98,
      y: 10 + groupIndex * 30,
    })) }));
    const next = updateStampBatchSize(pages, 'batch-a', 25);
    const firstPageYs = next[0].objects.map((object) => object.y);
    expect(firstPageYs).toEqual([10, 42.5, 75]);
    expect(next[1].objects.map((object) => object.y)).toEqual(firstPageYs);
    expect(firstPageYs[1]).toBeGreaterThanOrEqual(firstPageYs[0] + 25);
    expect(firstPageYs[2]).toBeGreaterThanOrEqual(firstPageYs[1] + 25);
  });

  it('rejects a batch resize that cannot fit all seam groups without changing input', () => {
    const pages = [{ objects: [0, 1, 2].map((groupIndex) => ({
      stampBatchId: 'batch-a', seamStamp: true, seamGroupId: `group-${groupIndex}`,
      width: 4, height: 10, x: 98, y: groupIndex * 30,
    })) }];
    expect(() => updateStampBatchSize(pages, 'batch-a', 40)).toThrow('骑缝章组无法容纳');
    expect(pages[0].objects[0]).toMatchObject({ height: 10, y: 0 });
  });
});

describe('clampObjectPosition', () => {
  it('keeps an ordinary object fully inside page bounds', () => {
    expect(clampObjectPosition({ x: 95, y: 98, width: 20, height: 15 })).toEqual({ x: 80, y: 85 });
  });
});

describe('getStampBatchSizeLimit', () => {
  it.each([
    [[], 'batch-a', 60],
    [[{ objects: [{ stampBatchId: 'batch-a', seamGroupId: 'one' }, { stampBatchId: 'batch-a', seamGroupId: 'two' }] }], 'batch-a', 50],
    [[{ objects: [
      { stampBatchId: 'batch-a', seamGroupId: 'one' },
      { stampBatchId: 'batch-a', seamGroupId: 'two' },
      { stampBatchId: 'batch-a', seamGroupId: 'three' },
    ] }], 'batch-a', 33],
    [[{ objects: [
      { seamGroupId: 'legacy-one' },
      { seamGroupId: 'legacy-two' },
    ] }], undefined, 60],
  ])('returns a safe slider limit for the batch', (pages, batchId, expected) => {
    expect(getStampBatchSizeLimit(pages, batchId)).toBe(expected);
  });
});

describe('moveSeamStampGroup', () => {
  it('moves every slice in the selected group vertically and clamps it to the page', () => {
    const pages = [
      { objects: [{ id: 'a', seamGroupId: 'group-a', x: 94, y: 10, height: 25 }] },
      { objects: [
        { id: 'b', seamGroupId: 'group-a', x: 94, y: 10, height: 25 },
        { id: 'c', seamGroupId: 'group-b', x: 92, y: 40, height: 20 },
      ] },
    ];
    const next = moveSeamStampGroup(pages, 'group-a', 90);
    expect(next[0].objects[0]).toMatchObject({ x: 94, y: 75 });
    expect(next[1].objects[0]).toMatchObject({ x: 94, y: 75 });
    expect(next[1].objects[1]).toBe(pages[1].objects[1]);
  });
});

describe('validateSeamPageRange', () => {
  it('accepts at least two consecutive pages within the document', () => {
    expect(validateSeamPageRange(2, 5, 7)).toEqual({ valid: true, pages: [2, 3, 4, 5] });
  });

  it.each([
    [1, 1, 5, '骑缝章至少需要 2 页'],
    [4, 2, 5, '结束页不能小于开始页'],
    [0, 3, 5, '页码必须在文档范围内'],
    [2, 6, 5, '页码必须在文档范围内'],
  ])('rejects invalid ranges', (start, end, count, error) => {
    expect(validateSeamPageRange(start, end, count)).toEqual({ valid: false, error });
  });
});

describe('createSeamStampLayout', () => {
  it('creates ordered slices at the right edge with common sizing', () => {
    expect(createSeamStampLayout([2, 3, 4], {
      top: 32,
      height: 24,
      width: 9,
      opacity: 0.8,
      groupId: 'seam-a',
    })).toEqual([
      { pageNumber: 2, x: 95.5, y: 32, width: 9, height: 24, opacity: 0.8, seamGroupId: 'seam-a', seamSide: 'right', sliceIndex: 0, sliceCount: 3 },
      { pageNumber: 3, x: 95.5, y: 32, width: 9, height: 24, opacity: 0.8, seamGroupId: 'seam-a', seamSide: 'right', sliceIndex: 1, sliceCount: 3 },
      { pageNumber: 4, x: 95.5, y: 32, width: 9, height: 24, opacity: 0.8, seamGroupId: 'seam-a', seamSide: 'right', sliceIndex: 2, sliceCount: 3 },
    ]);
  });
});

describe('insertSeamStampObjects', () => {
  it('immutably inserts the whole group into its target pages', () => {
    const pages = [{ objects: [] }, { objects: [] }, { objects: [] }];
    const objects = [
      { pageNumber: 1, id: 'a' },
      { pageNumber: 2, id: 'b' },
    ];
    const next = insertSeamStampObjects(pages, objects);
    expect(next[0].objects).toEqual([{ pageNumber: 1, id: 'a' }]);
    expect(next[1].objects).toEqual([{ pageNumber: 2, id: 'b' }]);
    expect(next[2]).toBe(pages[2]);
    expect(pages[0].objects).toEqual([]);
  });
});

describe('calculateVerticalSliceRegions', () => {
  it('covers every source pixel once and puts the remainder in the final slice', () => {
    expect(calculateVerticalSliceRegions(10, 3)).toEqual([
      { x: 0, width: 3 },
      { x: 3, width: 3 },
      { x: 6, width: 4 },
    ]);
  });

  it('rejects more slices than available source pixels', () => {
    expect(() => calculateVerticalSliceRegions(2, 3)).toThrow('切片数量不能超过图片宽度');
  });
});

describe('calculateSeamSliceWidthPercent', () => {
  it('converts the full stamp aspect ratio into page-relative slice width', () => {
    expect(calculateSeamSliceWidthPercent({
      heightPercent: 24,
      pageAspectRatio: 595 / 842,
      stampAspectRatio: 1,
      sliceCount: 3,
    })).toBeCloseTo(11.32, 1);
  });
});

describe('createSeamGroupLayouts', () => {
  it.each([1, 2, 3])('creates %i non-overlapping groups with the requested full height', (groupCount) => {
    const groups = createSeamGroupLayouts({
      groupCount,
      height: 20,
      top: 10,
      bottom: 10,
    });
    expect(groups).toHaveLength(groupCount);
    expect(groups.every((group) => group.height === 20)).toBe(true);
    groups.slice(1).forEach((group, index) => {
      expect(group.top).toBeGreaterThanOrEqual(groups[index].top + 20);
    });
  });

  it('rejects unsupported counts and layouts that cannot fit', () => {
    expect(() => createSeamGroupLayouts({ groupCount: 0, height: 20 })).toThrow('骑缝章数量必须为 1-3');
    expect(() => createSeamGroupLayouts({ groupCount: 4, height: 20 })).toThrow('骑缝章数量必须为 1-3');
    expect(() => createSeamGroupLayouts({ groupCount: 3, height: 30, top: 10, bottom: 10 })).toThrow('页面空间不足');
  });

  it.each([
    [{ groupCount: 1, height: Number.NaN }, '骑缝章高度必须为正数'],
    [{ groupCount: 1, height: -1 }, '骑缝章高度必须为正数'],
    [{ groupCount: 1, height: 20, top: -1 }, '页面留白不能为负数'],
    [{ groupCount: 1, height: 20, bottom: Number.NaN }, '页面留白不能为负数'],
    [{ groupCount: 1, height: 20, top: 60, bottom: 50 }, '页面空间不足'],
  ])('strictly validates layout inputs', (options, message) => {
    expect(() => createSeamGroupLayouts(options)).toThrow(message);
  });
});

describe('calculateStampHeight', () => {
  it('keeps a round stamp visually square on an A4 page', () => {
    expect(calculateStampHeight(28, 595 / 842, 1)).toBeCloseTo(19.79, 1);
  });
});

describe('calculateScaledDimensions', () => {
  it('limits the longest image edge without changing its aspect ratio', () => {
    expect(calculateScaledDimensions(3200, 1200, 1600)).toEqual({ width: 1600, height: 600 });
    expect(calculateScaledDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('normalizeWhiteRemovalStrength', () => {
  it('clamps the value to the supported 0-100 range', () => {
    expect(normalizeWhiteRemovalStrength(-1)).toBe(0);
    expect(normalizeWhiteRemovalStrength(64)).toBe(64);
    expect(normalizeWhiteRemovalStrength(101)).toBe(100);
  });
});

describe('removeWhitePixels', () => {
  it('makes white transparent and preserves saturated stamp pixels', () => {
    const imageData = {
      data: new Uint8ClampedArray([
        255, 255, 255, 255,
        238, 238, 238, 255,
        220, 35, 45, 255,
      ]),
      width: 3,
      height: 1,
    };

    removeWhitePixels(imageData, 60);

    expect(imageData.data[3]).toBe(0);
    expect(imageData.data[7]).toBeGreaterThan(0);
    expect(imageData.data[7]).toBeLessThan(255);
    expect(imageData.data[11]).toBe(255);
  });

  it('does not remove neutral pixels when strength is zero', () => {
    const imageData = {
      data: new Uint8ClampedArray([245, 245, 245, 200]),
      width: 1,
      height: 1,
    };

    removeWhitePixels(imageData, 0);

    expect(imageData.data[3]).toBe(200);
  });
});

describe('createStampObject', () => {
  it('creates an editable stamp while retaining the original source', () => {
    expect(createStampObject('data:image/png;base64,original', 'data:image/png;base64,clean', {
      id: 'stamp-1',
    })).toEqual({
      id: 'stamp-1',
      type: 'stamp',
      originalSrc: 'data:image/png;base64,original',
      src: 'data:image/png;base64,clean',
      whiteRemovalStrength: 60,
      x: 32,
      y: 38,
      width: 28,
      height: 20,
      imageAspectRatio: 1,
      rotation: 0,
      opacity: 1,
    });
  });
});

describe('updateStampOnPage', () => {
  it('updates the intended stamp even when another page is being viewed', () => {
    const pages = [
      { objects: [{ id: 'stamp-1', src: 'old', whiteRemovalStrength: 60 }] },
      { objects: [{ id: 'stamp-2', src: 'unchanged' }] },
    ];

    const next = updateStampOnPage(pages, 0, 'stamp-1', {
      src: 'new',
      whiteRemovalStrength: 80,
    });

    expect(next[0].objects[0].src).toBe('new');
    expect(next[0].objects[0].whiteRemovalStrength).toBe(80);
    expect(next[1]).toBe(pages[1]);
    expect(pages[0].objects[0].src).toBe('old');
    expect(pages[0].objects[0].whiteRemovalStrength).toBe(60);
  });
});
