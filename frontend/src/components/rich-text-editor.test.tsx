import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { RefObject } from 'react';
import RichTextEditor, { type RichTextEditorRef } from './rich-text-editor';

// jsdom lacks layout APIs that TipTap's Placeholder viewport tracking calls on
// every update. Stub them so the real editor can mount in the test environment.
if (!document.elementFromPoint) {
  document.elementFromPoint = (() => null) as unknown as typeof document.elementFromPoint;
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = (() => ({
    left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON: () => {},
  })) as unknown as Range['getBoundingClientRect'];
}

describe('RichTextEditor - debounced onChange (issue #114)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const waitForEditor = async (
    ref: RefObject<RichTextEditorRef | null>,
  ): Promise<NonNullable<RichTextEditorRef['editor']>> => {
    await waitFor(() => expect(ref.current?.editor).toBeTruthy());
    return ref.current!.editor!;
  };

  it('does not call onChange per keystroke - flushes once after the typing pause', async () => {
    const onChange = vi.fn();
    const ref: RefObject<RichTextEditorRef | null> = { current: null };
    render(<RichTextEditor ref={ref} content="<p>init</p>" onChange={onChange} />);

    // Mount under real timers so waitFor can poll for editor creation.
    const editor = await waitForEditor(ref);

    // Switch to fake timers for the debounce assertion.
    vi.useFakeTimers();

    // Simulate several rapid keystrokes - each fires onUpdate.
    act(() => {
      editor.commands.insertContent('a');
      editor.commands.insertContent('b');
      editor.commands.insertContent('c');
    });

    // Debounced: onChange must NOT fire on each keystroke.
    expect(onChange).not.toHaveBeenCalled();

    // Advance past the debounce window.
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Exactly one call with the latest HTML (coalesced, not 3 calls).
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(editor.getHTML());
  });

  it('flushes pending onChange immediately on blur', async () => {
    const onChange = vi.fn();
    const ref: RefObject<RichTextEditorRef | null> = { current: null };
    render(<RichTextEditor ref={ref} content="<p>init</p>" onChange={onChange} />);

    const editor = await waitForEditor(ref);
    vi.useFakeTimers();

    act(() => {
      editor.commands.insertContent('x');
    });
    expect(onChange).not.toHaveBeenCalled(); // still debounced

    // Blur should flush immediately without waiting for the timer.
    act(() => {
      editor.view.dom.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(editor.getHTML());
  });
});
