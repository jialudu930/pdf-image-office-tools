export function createPageMetadata(sources) {
  let outputPageNumber = 0;
  return sources.flatMap((source) =>
    Array.from({ length: source.pageCount }, (_, index) => ({
      id: `${source.id}-${index + 1}`,
      sourceId: source.id,
      sourceName: source.name,
      sourcePageNumber: index + 1,
      outputPageNumber: ++outputPageNumber,
    }))
  );
}

export function retainedPageNumbers(pageCount, deletedPages) {
  return Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((pageNumber) => !deletedPages.has(pageNumber));
}

export function canDeletePage(pageCount, deletedPages, pageNumber) {
  return deletedPages.has(pageNumber) || deletedPages.size < pageCount - 1;
}

