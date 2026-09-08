import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ImageUploader from './ImageUploader';

describe('ImageUploader', () => {
  it('uses a keyboard-accessible label and respects the processing lock', () => {
    const onFilesAdded = vi.fn();
    const { rerender } = render(<ImageUploader onFilesAdded={onFilesAdded} />);
    const input = screen.getByLabelText('点击或拖拽上传图片');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveClass('sr-only');
    expect(input).not.toHaveClass('hidden');
    input.focus();
    expect(input).toHaveFocus();
    rerender(<ImageUploader onFilesAdded={onFilesAdded} disabled />);
    expect(screen.getByLabelText('点击或拖拽上传图片')).toBeDisabled();
    fireEvent.drop(screen.getByText('点击或拖拽上传图片').closest('label'), {
      dataTransfer: { files: [{ name: 'locked.png', type: 'image/png' }] },
    });
    expect(onFilesAdded).not.toHaveBeenCalled();
  });
});
