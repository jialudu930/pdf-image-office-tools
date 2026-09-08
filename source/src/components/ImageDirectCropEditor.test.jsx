import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageDirectCropEditor from './ImageDirectCropEditor';

const file = { id: 'a', name: 'a.png', width: 1000, height: 500, previewUrl: 'blob:a' };
const crop = { left: .1, top: .1, right: .9, bottom: .9 };

afterEach(cleanup);

function renderEditor(overrides = {}) {
  const onCommit = vi.fn();
  const onInteractionChange = vi.fn();
  render(<ImageDirectCropEditor
    file={file}
    crop={crop}
    onCommit={onCommit}
    onInteractionChange={onInteractionChange}
    {...overrides}
  />);
  vi.spyOn(screen.getByTestId('crop-stage'), 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => {},
  });
  return { onCommit, onInteractionChange };
}

function firePointer(target, type, properties = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.entries(properties).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
  fireEvent(target, event);
}

describe('ImageDirectCropEditor', () => {
  it('renders an orange crop frame with eight accessible resize handles', () => {
    renderEditor();
    expect(screen.getByLabelText('裁剪区域')).toHaveClass('direct-crop-frame');
    ['上边', '下边', '左边', '右边', '左上角', '右上角', '左下角', '右下角'].forEach((name) => {
      expect(screen.getByRole('button', { name: `调整${name}` })).toBeInTheDocument();
    });
  });

  it('previews pointer movement but commits exactly once on pointerup', () => {
    const { onCommit, onInteractionChange } = renderEditor();
    const handle = screen.getByRole('button', { name: '调整右边' });
    firePointer(handle, 'pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    firePointer(window, 'pointermove', { clientX: 150, clientY: 100, pointerId: 1 });
    firePointer(window, 'pointermove', { clientX: 200, clientY: 100, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    firePointer(window, 'pointerup', { clientX: 200, clientY: 100, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ left: .1, top: .1, right: 1, bottom: .9 });
    expect(onInteractionChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });

  it('cancels and cleans the pointer session without committing', () => {
    const { onCommit, onInteractionChange } = renderEditor();
    firePointer(screen.getByRole('button', { name: '调整左边' }), 'pointerdown', { button: 0, clientX: 100, clientY: 100 });
    firePointer(window, 'pointermove', { clientX: 200, clientY: 100 });
    firePointer(window, 'pointercancel');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('裁剪区域')).toHaveStyle({ left: '10%' });
    expect(onInteractionChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });

  it('supports keyboard nudging of the crop and handles', () => {
    const { onCommit } = renderEditor();
    fireEvent.keyDown(screen.getByLabelText('裁剪区域'), { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith({ left: .11, top: .1, right: .91, bottom: .9 });
    fireEvent.keyDown(screen.getByRole('button', { name: '调整上边' }), { key: 'ArrowDown' });
    expect(onCommit).toHaveBeenLastCalledWith({ left: .11, top: .11, right: .91, bottom: .9 });
  });

  it('keeps the active pointer session across a parent lock rerender', () => {
    const firstCommit = vi.fn();
    const latestCommit = vi.fn();
    const interaction = vi.fn();
    const view = render(<ImageDirectCropEditor file={file} crop={crop} onCommit={firstCommit} onInteractionChange={interaction} />);
    vi.spyOn(screen.getByTestId('crop-stage'), 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => {},
    });
    firePointer(screen.getByRole('button', { name: '调整右边' }), 'pointerdown', { button: 0, clientX: 100, clientY: 100 });
    view.rerender(<ImageDirectCropEditor file={file} crop={crop} onCommit={latestCommit} onInteractionChange={interaction} />);
    firePointer(window, 'pointermove', { clientX: 200, clientY: 100 });
    firePointer(window, 'pointerup');
    expect(firstCommit).not.toHaveBeenCalled();
    expect(latestCommit).toHaveBeenCalledTimes(1);
  });

  it('ignores a second pointer without moving or ending the active gesture', () => {
    const { onCommit, onInteractionChange } = renderEditor();
    const handle = screen.getByRole('button', { name: '调整右边' });
    firePointer(handle, 'pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 11 });
    firePointer(window, 'pointermove', { clientX: 500, clientY: 100, pointerId: 22 });
    firePointer(window, 'pointerup', { clientX: 500, clientY: 100, pointerId: 22 });
    firePointer(window, 'pointercancel', { pointerId: 22 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onInteractionChange.mock.calls.map(([value]) => value)).toEqual([true]);

    firePointer(window, 'pointermove', { clientX: 200, clientY: 100, pointerId: 11 });
    firePointer(window, 'pointerup', { pointerId: 11 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ left: .1, top: .1, right: 1, bottom: .9 });
    expect(onInteractionChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });

  it('cancels the active gesture when the window loses focus', () => {
    const { onCommit, onInteractionChange } = renderEditor();
    firePointer(screen.getByRole('button', { name: '调整左边' }), 'pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 7 });
    firePointer(window, 'pointermove', { clientX: 200, clientY: 100, pointerId: 7 });
    fireEvent.blur(window);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('裁剪区域')).toHaveStyle({ left: '10%' });
    expect(onInteractionChange.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });
});
