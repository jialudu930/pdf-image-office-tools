import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageMergerApp from './ImageMergerApp';

const mocks = vi.hoisted(() => ({
  readImageFile: vi.fn(),
  mergeImages: vi.fn(),
  captured: {},
}));

vi.mock('@/lib/imageUtils', () => ({
  readImageFile: mocks.readImageFile,
  mergeImages: mocks.mergeImages,
  createPanoramaLayout: (files) => ({
    width: files.length ? 100 : 0,
    height: files.length * 100,
    items: files.map((file) => ({ id: file.id, regionHeight: 100, naturalHeight: 100, zoom: 1, positionX: 0, positionY: 0 })),
  }),
  FULL_CROP: { left: 0, top: 0, right: 1, bottom: 1 },
  updatePanoramaCrop: (layout) => layout,
}));
vi.mock('./ImageUploader', () => ({ default: (props) => {
  mocks.captured.uploader = props;
  return <button type="button" disabled={props.disabled} onClick={() => props.onFilesAdded([{ name: 'next.png', type: 'image/png' }])}>上传测试图片</button>;
} }));
vi.mock('./ImageList', () => ({ default: (props) => {
  mocks.captured.list = props;
  return <div data-testid="list" data-disabled={String(props.disabled)}>{props.files.map((file) => file.name).join(',')}</div>;
} }));
vi.mock('./ImageMergeSettings', () => ({ default: (props) => {
  mocks.captured.settings = props;
  return <button type="button" disabled={props.isProcessing} onClick={() => props.onMerge('merged.png', 'image/png')}>导出</button>;
} }));
vi.mock('./ImageMergePreview', () => ({ default: (props) => {
  mocks.captured.preview = props;
  return <div data-testid="preview" data-disabled={String(props.disabled)}>{props.layout.items.length}</div>;
} }));
vi.mock('./ImageDirectCropEditor', () => ({ default: (props) => {
  mocks.captured.crop = props;
  return <div data-testid="crop" data-disabled={String(props.disabled)} />;
} }));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('ImageMergerApp operation lifecycle', () => {
  beforeEach(() => {
    mocks.readImageFile.mockReset();
    mocks.mergeImages.mockReset();
    mocks.captured = {};
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:download'), configurable: true });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows only the centered upload experience before images are added', () => {
    const { container } = render(<ImageMergerApp />);
    expect(container.querySelector('.panorama-empty-workspace')).toBeInTheDocument();
    expect(container.querySelector('.panorama-toolbar')).not.toBeInTheDocument();
    expect(container.querySelector('.panorama-order-strip-wrap')).not.toBeInTheDocument();
  });

  it('switches to the compact toolbar, order strip and central panorama after upload', async () => {
    mocks.readImageFile.mockResolvedValueOnce({ id: 'a', name: 'a.png', width: 100, height: 100, previewUrl: 'blob:a' });
    const { container } = render(<ImageMergerApp />);
    fireEvent.click(screen.getByRole('button', { name: '上传测试图片' }));
    await waitFor(() => expect(container.querySelector('.panorama-toolbar')).toBeInTheDocument());
    expect(container.querySelector('.panorama-order-strip-wrap')).toBeInTheDocument();
    expect(container.querySelector('.panorama-main')).toBeInTheDocument();
  });

  it('invalidates a pending read on clear and revokes every completed stale URL', async () => {
    const first = { id: 'first', name: 'first.png', width: 100, height: 100, previewUrl: 'blob:first' };
    const stale = { id: 'stale', name: 'stale.png', width: 100, height: 100, previewUrl: 'blob:stale' };
    mocks.readImageFile.mockResolvedValueOnce(first);
    render(<ImageMergerApp />);
    fireEvent.click(screen.getByRole('button', { name: '上传测试图片' }));
    await waitFor(() => expect(screen.getByTestId('list')).toHaveTextContent('first.png'));

    const pending = deferred();
    mocks.readImageFile.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: '上传测试图片' }));
    expect(screen.getByRole('button', { name: '上传测试图片' })).toBeDisabled();
    expect(screen.getByTestId('list')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('preview')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('crop')).toHaveAttribute('data-disabled', 'true');

    act(() => mocks.captured.list.onClearAll());
    await act(async () => pending.resolve(stale));
    await waitFor(() => expect(document.querySelector('.panorama-empty-workspace')).toBeInTheDocument());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale');
  });

  it('revokes a read URL that completes after unmount', async () => {
    const pending = deferred();
    mocks.readImageFile.mockReturnValueOnce(pending.promise);
    const view = render(<ImageMergerApp />);
    fireEvent.click(screen.getByRole('button', { name: '上传测试图片' }));
    view.unmount();
    await act(async () => pending.resolve({ id: 'late', previewUrl: 'blob:late', name: 'late.png', width: 1, height: 1 }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
  });

  it('exports an immutable workspace snapshot and ignores mutating callbacks while locked', async () => {
    const loaded = [
      { id: 'a', name: 'a.png', width: 100, height: 100, previewUrl: 'blob:a' },
      { id: 'b', name: 'b.png', width: 100, height: 100, previewUrl: 'blob:b' },
    ];
    mocks.readImageFile.mockResolvedValueOnce(loaded[0]).mockResolvedValueOnce(loaded[1]);
    render(<ImageMergerApp />);
    await act(async () => mocks.captured.uploader.onFilesAdded([
      { name: 'a.png', type: 'image/png' },
      { name: 'b.png', type: 'image/png' },
    ]));
    const pending = deferred();
    mocks.mergeImages.mockReturnValueOnce(pending.promise);
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => (
      tagName === 'a' ? { click: vi.fn() } : createElement(tagName, options)
    ));
    fireEvent.click(screen.getByRole('button', { name: '导出' }));
    expect(mocks.mergeImages).toHaveBeenCalledWith(
      expect.any(Array),
      'image/png',
      expect.objectContaining({ items: expect.any(Array) }),
    );
    const exportedFiles = mocks.mergeImages.mock.calls[0][0];
    expect(exportedFiles.map((file) => file.id)).toEqual(['a', 'b']);
    act(() => mocks.captured.list.onRemove(0));
    expect(screen.getByTestId('list')).toHaveTextContent('a.png,b.png');
    await act(async () => pending.resolve(new Blob(['ok'])));
  });
});
