import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageList from './ImageList';

afterEach(cleanup);

describe('ImageList order strip', () => {
  const files = [
    { id: 'a', name: 'a.png', width: 10, height: 20, previewUrl: 'blob:a' },
    { id: 'b', name: 'b.png', width: 10, height: 20, previewUrl: 'blob:b' },
  ];

  it('provides selection, ordering and removal in a horizontal strip', () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(<ImageList files={files} selectedId="a" onSelect={onSelect} onMove={onMove} onRemove={onRemove} onClearAll={vi.fn()} />);
    expect(container.querySelector('.panorama-order-strip')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '选择 b.png' }));
    fireEvent.click(screen.getByRole('button', { name: '上移 b.png' }));
    fireEvent.click(screen.getByRole('button', { name: '删除 b.png' }));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(onMove).toHaveBeenCalledWith(1, -1);
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
