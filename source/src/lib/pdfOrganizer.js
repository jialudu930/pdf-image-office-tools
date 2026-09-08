import { PDFDocument, degrees } from 'pdf-lib';

export async function organizePdf(bytes, order, rotations = {}) {
  if (!order.length) throw new Error('至少保留一页');
  const source = await PDFDocument.load(bytes);
  if (order.some((page) => !Number.isInteger(page) || page < 1 || page > source.getPageCount())) throw new Error('页码超出范围');
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, order.map((n) => n - 1));
  pages.forEach((page, i) => {
    page.setRotation(degrees((page.getRotation().angle + (rotations[order[i]] || 0)) % 360));
    output.addPage(page);
  });
  return output.save();
}
