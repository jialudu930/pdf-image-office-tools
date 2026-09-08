import { describe, expect, it } from 'vitest';
import { canDeletePage, createPageMetadata, retainedPageNumbers } from './pdfWorkspace';

describe('PDF workspace helpers', () => {
  it('keeps source information while assigning output page numbers', () => {
    const pages = createPageMetadata([
      { id: 'a', name: '甲.pdf', pageCount: 2 },
      { id: 'b', name: '乙.pdf', pageCount: 1 },
    ]);
    expect(pages).toEqual([
      { id: 'a-1', sourceId: 'a', sourceName: '甲.pdf', sourcePageNumber: 1, outputPageNumber: 1 },
      { id: 'a-2', sourceId: 'a', sourceName: '甲.pdf', sourcePageNumber: 2, outputPageNumber: 2 },
      { id: 'b-1', sourceId: 'b', sourceName: '乙.pdf', sourcePageNumber: 1, outputPageNumber: 3 },
    ]);
  });

  it('returns retained one-based page numbers', () => {
    expect(retainedPageNumbers(4, new Set([2, 4]))).toEqual([1, 3]);
  });

  it('prevents deleting the final retained page', () => {
    expect(canDeletePage(2, new Set([1]), 2)).toBe(false);
    expect(canDeletePage(2, new Set([1]), 1)).toBe(true);
  });
});

