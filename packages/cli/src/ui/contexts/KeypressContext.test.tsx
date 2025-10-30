/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { Key } from './KeypressContext.js';
import {
  KeypressProvider,
  useKeypressContext,
  DRAG_COMPLETION_TIMEOUT_MS,
  // CSI_END_O,
  // SS3_END,
  SINGLE_QUOTE,
  DOUBLE_QUOTE,
} from './KeypressContext.js';
import { useStdin } from 'ink';
import { EventEmitter } from 'node:events';

// Mock the 'ink' module to control stdin
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useStdin: vi.fn(),
  };
});

class MockStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  override on = this.addListener;
  override removeListener = super.removeListener;
  write = vi.fn();
  resume = vi.fn();
  pause = vi.fn();

  // Helper to simulate a keypress event
  pressKey(key: Partial<Key>) {
    this.emit('keypress', null, key);
  }

  // Helper to simulate a kitty protocol sequence
  sendKittySequence(sequence: string) {
    this.emit('data', Buffer.from(sequence));
  }

  // Helper to simulate a paste event
  sendPaste(text: string) {
    const PASTE_MODE_PREFIX = `\x1b[200~`;
    const PASTE_MODE_SUFFIX = `\x1b[201~`;
    this.emit('data', Buffer.from(PASTE_MODE_PREFIX));
    this.emit('data', Buffer.from(text));
    this.emit('data', Buffer.from(PASTE_MODE_SUFFIX));
  }
}

describe('KeypressContext - Kitty Protocol', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();

  const wrapper = ({
    children,
    kittyProtocolEnabled = true,
    pasteWorkaround = false,
  }: {
    children: React.ReactNode;
    kittyProtocolEnabled?: boolean;
    pasteWorkaround?: boolean;
  }) => (
    <KeypressProvider
      kittyProtocolEnabled={kittyProtocolEnabled}
      pasteWorkaround={pasteWorkaround}
    >
      {children}
    </KeypressProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });
  });

  describe('Enter key handling', () => {
    it('should recognize regular enter key (keycode 13) in kitty protocol', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for regular enter: ESC[13u
      act(() => {
        stdin.sendKittySequence(`\x1b[13u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: false,
          meta: false,
          shift: false,
        }),
      );
    });

    it('should recognize numpad enter key (keycode 57414) in kitty protocol', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter: ESC[57414u
      act(() => {
        stdin.sendKittySequence(`\x1b[57414u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: false,
          meta: false,
          shift: false,
        }),
      );
    });

    it('should handle numpad enter with modifiers', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter with Shift (modifier 2): ESC[57414;2u
      act(() => {
        stdin.sendKittySequence(`\x1b[57414;2u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: false,
          meta: false,
          shift: true,
        }),
      );
    });

    it('should handle numpad enter with Ctrl modifier', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter with Ctrl (modifier 5): ESC[57414;5u
      act(() => {
        stdin.sendKittySequence(`\x1b[57414;5u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: true,
          meta: false,
          shift: false,
        }),
      );
    });

    it('should handle numpad enter with Alt modifier', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter with Alt (modifier 3): ESC[57414;3u
      act(() => {
        stdin.sendKittySequence(`\x1b[57414;3u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
          ctrl: false,
          meta: true,
          shift: false,
        }),
      );
    });

    it('should not process kitty sequences when kitty protocol is disabled', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: false }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for numpad enter
      act(() => {
        stdin.sendKittySequence(`\x1b[57414u`);
      });

      // When kitty protocol is disabled, the sequence should be passed through
      // as individual keypresses, not recognized as a single enter key
      expect(keyHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'return',
          kittyProtocol: true,
        }),
      );
    });
  });

  describe('Escape key handling', () => {
    it('should recognize escape key (keycode 27) in kitty protocol', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) =>
          wrapper({ children, kittyProtocolEnabled: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send kitty protocol sequence for escape: ESC[27u
      act(() => {
        stdin.sendKittySequence('\x1b[27u');
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'escape',
          kittyProtocol: true,
        }),
      );
    });
  });

  describe('Tab and Backspace handling', () => {
    it('should recognize Tab key in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => {
        stdin.sendKittySequence(`\x1b[9u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tab',
          kittyProtocol: true,
          shift: false,
        }),
      );
    });

    it('should recognize Shift+Tab in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Modifier 2 is Shift
      act(() => {
        stdin.sendKittySequence(`\x1b[9;2u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'tab',
          kittyProtocol: true,
          shift: true,
        }),
      );
    });

    it('should recognize Backspace key in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => {
        stdin.sendKittySequence(`\x1b[127u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          kittyProtocol: true,
          meta: false,
        }),
      );
    });

    it('should recognize Option+Backspace in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Modifier 3 is Alt/Option
      act(() => {
        stdin.sendKittySequence(`\x1b[127;3u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          kittyProtocol: true,
          meta: true,
        }),
      );
    });

    it('should recognize Ctrl+Backspace in kitty protocol', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Modifier 5 is Ctrl
      act(() => {
        stdin.sendKittySequence(`\x1b[127;5u`);
      });

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'backspace',
          kittyProtocol: true,
          ctrl: true,
        }),
      );
    });
  });

  describe('paste mode', () => {
    it('should handle multiline paste as a single event', async () => {
      const keyHandler = vi.fn();
      const pastedText = 'This \n is \n a \n multiline \n paste.';

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper,
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Simulate a bracketed paste event
      act(() => {
        stdin.sendPaste(pastedText);
      });

      await waitFor(() => {
        // Expect the handler to be called exactly once for the entire paste
        expect(keyHandler).toHaveBeenCalledTimes(1);
      });

      // Verify the single event contains the full pasted text
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          paste: true,
          sequence: pastedText,
        }),
      );
    });

    describe('paste mode markers', () => {
      // These tests use pasteWorkaround=true to force passthrough mode for raw keypress testing

      it('should handle complete paste sequence with markers', async () => {
        const keyHandler = vi.fn();
        const pastedText = 'pasted content';

        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: ({ children }) =>
            wrapper({ children, pasteWorkaround: true }),
        });

        act(() => {
          result.current.subscribe(keyHandler);
        });

        // Send complete paste sequence: prefix + content + suffix
        act(() => {
          stdin.emit('data', Buffer.from(`\x1b[200~${pastedText}\x1b[201~`));
        });

        await waitFor(() => {
          expect(keyHandler).toHaveBeenCalledTimes(1);
        });

        // Should emit a single paste event with the content
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            paste: true,
            sequence: pastedText,
            name: '',
          }),
        );
      });

      it('should handle empty paste sequence', async () => {
        const keyHandler = vi.fn();

        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: ({ children }) =>
            wrapper({ children, pasteWorkaround: true }),
        });

        act(() => {
          result.current.subscribe(keyHandler);
        });

        // Send empty paste sequence: prefix immediately followed by suffix
        act(() => {
          stdin.emit('data', Buffer.from('\x1b[200~\x1b[201~'));
        });

        await waitFor(() => {
          expect(keyHandler).toHaveBeenCalledTimes(1);
        });

        // Should emit a paste event with empty content
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            paste: true,
            sequence: '',
            name: '',
          }),
        );
      });

      it('should handle data before paste markers', async () => {
        const keyHandler = vi.fn();

        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: ({ children }) =>
            wrapper({ children, pasteWorkaround: true }),
        });

        act(() => {
          result.current.subscribe(keyHandler);
        });

        // Send data before paste sequence
        act(() => {
          stdin.emit('data', Buffer.from('before\x1b[200~pasted\x1b[201~'));
        });

        await waitFor(() => {
          expect(keyHandler).toHaveBeenCalledTimes(7); // 6 chars + 1 paste event
        });

        // Should process 'before' as individual characters
        expect(keyHandler).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ name: 'b' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ name: 'e' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({ name: 'f' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          4,
          expect.objectContaining({ name: 'o' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          5,
          expect.objectContaining({ name: 'r' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          6,
          expect.objectContaining({ name: 'e' }),
        );

        // Then emit paste event
        expect(keyHandler).toHaveBeenNthCalledWith(
          7,
          expect.objectContaining({
            paste: true,
            sequence: 'pasted',
          }),
        );
      });

      it('should handle data after paste markers', async () => {
        const keyHandler = vi.fn();

        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: ({ children }) =>
            wrapper({ children, pasteWorkaround: true }),
        });

        act(() => {
          result.current.subscribe(keyHandler);
        });

        // Send paste sequence followed by data
        act(() => {
          stdin.emit('data', Buffer.from('\x1b[200~pasted\x1b[201~after'));
        });

        await waitFor(() => {
          expect(keyHandler).toHaveBeenCalledTimes(6); // 1 paste event + 5 individual chars for 'after'
        });

        // Should emit paste event first
        expect(keyHandler).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            paste: true,
            sequence: 'pasted',
          }),
        );

        // Then process 'after' as individual characters (since it doesn't contain return)
        expect(keyHandler).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            name: 'a',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({
            name: 'f',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          4,
          expect.objectContaining({
            name: 't',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          5,
          expect.objectContaining({
            name: 'e',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          6,
          expect.objectContaining({
            name: 'r',
            paste: false,
          }),
        );
      });

      it('should handle complex sequence with multiple paste blocks', async () => {
        const keyHandler = vi.fn();

        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: ({ children }) =>
            wrapper({ children, pasteWorkaround: true }),
        });

        act(() => {
          result.current.subscribe(keyHandler);
        });

        // Send complex sequence: data + paste1 + data + paste2 + data
        act(() => {
          stdin.emit(
            'data',
            Buffer.from(
              'start\x1b[200~first\x1b[201~middle\x1b[200~second\x1b[201~end',
            ),
          );
        });

        await waitFor(() => {
          expect(keyHandler).toHaveBeenCalledTimes(16); // 5 + 1 + 6 + 1 + 3 = 16 calls
        });

        // Check the sequence: 'start' (5 chars) + paste1 + 'middle' (6 chars) + paste2 + 'end' (3 chars as paste)
        let callIndex = 1;

        // 'start'
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 's' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 't' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'a' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'r' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 't' }),
        );

        // first paste
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({
            paste: true,
            sequence: 'first',
          }),
        );

        // 'middle'
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'm' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'i' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'd' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'd' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'l' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'e' }),
        );

        // second paste
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({
            paste: true,
            sequence: 'second',
          }),
        );

        // 'end' as individual characters (since it doesn't contain return)
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'e' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'n' }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          callIndex++,
          expect.objectContaining({ name: 'd' }),
        );
      });

      it('should handle fragmented paste markers across multiple data events', async () => {
        const keyHandler = vi.fn();

        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: ({ children }) =>
            wrapper({ children, pasteWorkaround: true }),
        });

        act(() => {
          result.current.subscribe(keyHandler);
        });

        // Send fragmented paste sequence
        act(() => {
          stdin.emit('data', Buffer.from('\x1b[200~partial'));
          stdin.emit('data', Buffer.from(' content\x1b[201~'));
        });

        await waitFor(() => {
          expect(keyHandler).toHaveBeenCalledTimes(1);
        });

        // Should combine the fragmented content into a single paste event
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            paste: true,
            sequence: 'partial content',
          }),
        );
      });

      it('should handle multiline content within paste markers', async () => {
        const keyHandler = vi.fn();
        const multilineContent = 'line1\nline2\nline3';

        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: ({ children }) =>
            wrapper({ children, pasteWorkaround: true }),
        });

        act(() => {
          result.current.subscribe(keyHandler);
        });

        // Send paste sequence with multiline content
        act(() => {
          stdin.emit(
            'data',
            Buffer.from(`\x1b[200~${multilineContent}\x1b[201~`),
          );
        });

        await waitFor(() => {
          expect(keyHandler).toHaveBeenCalledTimes(1);
        });

        // Should emit a single paste event with the multiline content
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            paste: true,
            sequence: multilineContent,
          }),
        );
      });

      it('should handle paste markers split across buffer boundaries', async () => {
        const keyHandler = vi.fn();

        const { result } = renderHook(() => useKeypressContext(), {
          wrapper: ({ children }) =>
            wrapper({ children, pasteWorkaround: true }),
        });

        act(() => {
          result.current.subscribe(keyHandler);
        });

        // Send paste marker split across multiple data events
        act(() => {
          stdin.emit('data', Buffer.from('\x1b[20'));
          stdin.emit('data', Buffer.from('0~content\x1b[2'));
          stdin.emit('data', Buffer.from('01~'));
        });

        await waitFor(() => {
          // With the current implementation, fragmented paste markers get reconstructed
          // into a single paste event for 'content'
          expect(keyHandler).toHaveBeenCalledTimes(1);
        });

        // Should reconstruct the fragmented paste markers into a single paste event
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            paste: true,
            sequence: 'content',
          }),
        );
      });
    });

    it('buffers fragmented paste chunks before emitting newlines', () => {
      vi.useFakeTimers();
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) => wrapper({ children, pasteWorkaround: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      try {
        act(() => {
          stdin.emit('data', Buffer.from('\r'));
          stdin.emit('data', Buffer.from('rest of paste'));
        });

        act(() => {
          vi.advanceTimersByTime(8);
        });

        // With the current implementation, fragmented data gets combined and
        // treated as a single paste event due to the buffering mechanism
        expect(keyHandler).toHaveBeenCalledTimes(1);

        // Should be treated as a paste event with the combined content
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            paste: true,
            sequence: '\rrest of paste',
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Raw keypress pipeline', () => {
    // These tests use pasteWorkaround=true to force passthrough mode for raw keypress testing

    it('should buffer input data and wait for timeout', () => {
      vi.useFakeTimers();
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) => wrapper({ children, pasteWorkaround: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      try {
        // Send single character
        act(() => {
          stdin.emit('data', Buffer.from('a'));
        });

        // With the current implementation, single characters are processed immediately
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'a',
            sequence: 'a',
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should concatenate new data and reset timeout', () => {
      vi.useFakeTimers();
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) => wrapper({ children, pasteWorkaround: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      try {
        // Send first chunk
        act(() => {
          stdin.emit('data', Buffer.from('hel'));
        });

        // Advance timer partially
        act(() => {
          vi.advanceTimersByTime(4);
        });

        // Send second chunk before timeout
        act(() => {
          stdin.emit('data', Buffer.from('lo'));
        });

        // With the current implementation, data is processed as individual characters
        // since 'hel' doesn't contain return (0x0d)
        expect(keyHandler).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            name: 'h',
            sequence: 'h',
            paste: false,
          }),
        );

        expect(keyHandler).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            name: 'e',
            sequence: 'e',
            paste: false,
          }),
        );

        expect(keyHandler).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({
            name: 'l',
            sequence: 'l',
            paste: false,
          }),
        );

        // Second chunk 'lo' is also processed as individual characters
        expect(keyHandler).toHaveBeenNthCalledWith(
          4,
          expect.objectContaining({
            name: 'l',
            sequence: 'l',
            paste: false,
          }),
        );

        expect(keyHandler).toHaveBeenNthCalledWith(
          5,
          expect.objectContaining({
            name: 'o',
            sequence: 'o',
            paste: false,
          }),
        );

        expect(keyHandler).toHaveBeenCalledTimes(5);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should flush immediately when buffer exceeds limit', () => {
      vi.useFakeTimers();
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) => wrapper({ children, pasteWorkaround: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      try {
        // Create a large buffer that exceeds the 64 byte limit
        const largeData = 'x'.repeat(65);

        act(() => {
          stdin.emit('data', Buffer.from(largeData));
        });

        // Should flush immediately without waiting for timeout
        // Large data without return gets treated as individual characters
        expect(keyHandler).toHaveBeenCalledTimes(65);

        // Each character should be processed individually
        for (let i = 0; i < 65; i++) {
          expect(keyHandler).toHaveBeenNthCalledWith(
            i + 1,
            expect.objectContaining({
              name: 'x',
              sequence: 'x',
              paste: false,
            }),
          );
        }

        // Advancing timer should not cause additional calls
        const callCountBefore = keyHandler.mock.calls.length;
        act(() => {
          vi.advanceTimersByTime(8);
        });

        expect(keyHandler).toHaveBeenCalledTimes(callCountBefore);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clear timeout when new data arrives', () => {
      vi.useFakeTimers();
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) => wrapper({ children, pasteWorkaround: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      try {
        // Send first chunk
        act(() => {
          stdin.emit('data', Buffer.from('a'));
        });

        // Advance timer almost to completion
        act(() => {
          vi.advanceTimersByTime(7);
        });

        // Send second chunk (should reset timeout)
        act(() => {
          stdin.emit('data', Buffer.from('b'));
        });

        // With the current implementation, both characters are processed immediately
        expect(keyHandler).toHaveBeenCalledTimes(2);

        // First event should be 'a', second should be 'b'
        expect(keyHandler).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            name: 'a',
            sequence: 'a',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            name: 'b',
            sequence: 'b',
            paste: false,
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle multiple separate keypress events', () => {
      vi.useFakeTimers();
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) => wrapper({ children, pasteWorkaround: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      try {
        // First keypress
        act(() => {
          stdin.emit('data', Buffer.from('a'));
        });

        act(() => {
          vi.advanceTimersByTime(8);
        });

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            sequence: 'a',
          }),
        );

        keyHandler.mockClear();

        // Second keypress after first completed
        act(() => {
          stdin.emit('data', Buffer.from('b'));
        });

        act(() => {
          vi.advanceTimersByTime(8);
        });

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            sequence: 'b',
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle rapid sequential data within buffer limit', () => {
      vi.useFakeTimers();
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), {
        wrapper: ({ children }) => wrapper({ children, pasteWorkaround: true }),
      });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      try {
        // Send multiple small chunks rapidly
        act(() => {
          stdin.emit('data', Buffer.from('h'));
          stdin.emit('data', Buffer.from('e'));
          stdin.emit('data', Buffer.from('l'));
          stdin.emit('data', Buffer.from('l'));
          stdin.emit('data', Buffer.from('o'));
        });

        // With the current implementation, each character is processed immediately
        expect(keyHandler).toHaveBeenCalledTimes(5);

        // Each character should be processed as individual keypress events
        expect(keyHandler).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            name: 'h',
            sequence: 'h',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            name: 'e',
            sequence: 'e',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({
            name: 'l',
            sequence: 'l',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          4,
          expect.objectContaining({
            name: 'l',
            sequence: 'l',
            paste: false,
          }),
        );
        expect(keyHandler).toHaveBeenNthCalledWith(
          5,
          expect.objectContaining({
            name: 'o',
            sequence: 'o',
            paste: false,
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('debug keystroke logging', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should not log keystrokes when debugKeystrokeLogging is false', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={false}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send a kitty sequence
      act(() => {
        stdin.sendKittySequence('\x1b[27u');
      });

      expect(keyHandler).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Kitty'),
      );
    });

    it('should log kitty buffer accumulation when debugKeystrokeLogging is true', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={true}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send a complete kitty sequence for escape
      act(() => {
        stdin.sendKittySequence('\x1b[27u');
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Kitty buffer accumulating:',
        expect.stringContaining('\x1b[27u'),
      );
      const parsedCall = consoleLogSpy.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('[DEBUG] Kitty sequence parsed successfully'),
      );
      expect(parsedCall).toBeTruthy();
      expect(parsedCall?.[1]).toEqual(expect.stringContaining('\x1b[27u'));
    });

    it('should log kitty buffer overflow when debugKeystrokeLogging is true', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={true}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send an invalid long sequence to trigger overflow
      const longInvalidSequence = '\x1b[' + 'x'.repeat(100);
      act(() => {
        stdin.sendKittySequence(longInvalidSequence);
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Kitty buffer overflow, clearing:',
        expect.any(String),
      );
    });

    it('should log kitty buffer clear on Ctrl+C when debugKeystrokeLogging is true', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={true}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send incomplete kitty sequence
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\x1b[1',
        });
      });

      // Send Ctrl+C
      act(() => {
        stdin.pressKey({
          name: 'c',
          ctrl: true,
          meta: false,
          shift: false,
          sequence: '\x03',
        });
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Kitty buffer cleared on Ctrl+C:',
        '\x1b[1',
      );

      // Verify Ctrl+C was handled
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'c',
          ctrl: true,
        }),
      );
    });

    it('should show char codes when debugKeystrokeLogging is true even without debug mode', async () => {
      const keyHandler = vi.fn();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <KeypressProvider
          kittyProtocolEnabled={true}
          debugKeystrokeLogging={true}
        >
          {children}
        </KeypressProvider>
      );

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Send incomplete kitty sequence
      const sequence = '\x1b[12';
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          sequence,
        });
      });

      // Verify debug logging for accumulation
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Kitty buffer accumulating:',
        sequence,
      );

      // Verify warning for char codes
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Kitty sequence buffer has char codes:',
        [27, 91, 49, 50],
      );
    });
  });

  describe('Parameterized functional keys', () => {
    it.each([
      // Parameterized
      { sequence: `\x1b[1;2H`, expected: { name: 'home', shift: true } },
      { sequence: `\x1b[1;5F`, expected: { name: 'end', ctrl: true } },
      { sequence: `\x1b[1;1P`, expected: { name: 'f1' } },
      { sequence: `\x1b[1;3Q`, expected: { name: 'f2', meta: true } },
      { sequence: `\x1b[3~`, expected: { name: 'delete' } },
      { sequence: `\x1b[5~`, expected: { name: 'pageup' } },
      { sequence: `\x1b[6~`, expected: { name: 'pagedown' } },
      { sequence: `\x1b[1~`, expected: { name: 'home' } },
      { sequence: `\x1b[4~`, expected: { name: 'end' } },
      { sequence: `\x1b[2~`, expected: { name: 'insert' } },
      // Legacy Arrows
      {
        sequence: `\x1b[A`,
        expected: { name: 'up', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[B`,
        expected: { name: 'down', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[C`,
        expected: { name: 'right', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[D`,
        expected: { name: 'left', ctrl: false, meta: false, shift: false },
      },
      // Legacy Home/End
      {
        sequence: `\x1b[H`,
        expected: { name: 'home', ctrl: false, meta: false, shift: false },
      },
      {
        sequence: `\x1b[F`,
        expected: { name: 'end', ctrl: false, meta: false, shift: false },
      },
    ])(
      'should recognize sequence "$sequence" as $expected.name',
      ({ sequence, expected }) => {
        const keyHandler = vi.fn();
        const { result } = renderHook(() => useKeypressContext(), { wrapper });
        act(() => result.current.subscribe(keyHandler));

        act(() => stdin.sendKittySequence(sequence));

        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining(expected),
        );
      },
    );
  });

  describe('Shift+Tab forms', () => {
    it.each([
      { sequence: `\x1b[Z`, description: 'legacy reverse Tab' },
      { sequence: `\x1b[1;2Z`, description: 'parameterized reverse Tab' },
    ])(
      'should recognize $description "$sequence" as Shift+Tab',
      ({ sequence }) => {
        const keyHandler = vi.fn();
        const { result } = renderHook(() => useKeypressContext(), { wrapper });
        act(() => result.current.subscribe(keyHandler));

        act(() => stdin.sendKittySequence(sequence));
        expect(keyHandler).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'tab', shift: true }),
        );
      },
    );
  });

  describe('Double-tap and batching', () => {
    it('should emit two delete events for double-tap CSI[3~', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => stdin.sendKittySequence(`\x1b[3~`));
      act(() => stdin.sendKittySequence(`\x1b[3~`));

      expect(keyHandler).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ name: 'delete' }),
      );
      expect(keyHandler).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ name: 'delete' }),
      );
    });

    it('should parse two concatenated tilde-coded sequences in one chunk', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      act(() => stdin.sendKittySequence(`\x1b[3~\x1b[5~`));

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'delete' }),
      );
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'pageup' }),
      );
    });

    it('should ignore incomplete CSI then parse the next complete sequence', async () => {
      const keyHandler = vi.fn();
      const { result } = renderHook(() => useKeypressContext(), { wrapper });
      act(() => result.current.subscribe(keyHandler));

      // Incomplete ESC sequence then a complete Delete
      act(() => {
        // Provide an incomplete ESC sequence chunk with a real ESC character
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          sequence: '\x1b[1;',
        });
      });
      act(() => stdin.sendKittySequence(`\x1b[3~`));

      expect(keyHandler).toHaveBeenCalledTimes(1);
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'delete' }),
      );
    });
  });
});

describe('Drag and Drop Handling', () => {
  let stdin: MockStdin;
  const mockSetRawMode = vi.fn();

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <KeypressProvider kittyProtocolEnabled={true}>{children}</KeypressProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stdin = new MockStdin();
    (useStdin as Mock).mockReturnValue({
      stdin,
      setRawMode: mockSetRawMode,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('drag start by quotes', () => {
    it('should start collecting when single quote arrives and not broadcast immediately', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: SINGLE_QUOTE,
        });
      });

      expect(keyHandler).not.toHaveBeenCalled();
    });

    it('should start collecting when double quote arrives and not broadcast immediately', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: DOUBLE_QUOTE,
        });
      });

      expect(keyHandler).not.toHaveBeenCalled();
    });
  });

  describe('drag collection and completion', () => {
    it('should collect single character inputs during drag mode', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Start by single quote
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: SINGLE_QUOTE,
        });
      });

      // Send single character
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'a',
        });
      });

      // Character should not be immediately broadcast
      expect(keyHandler).not.toHaveBeenCalled();

      // Fast-forward to completion timeout
      act(() => {
        vi.advanceTimersByTime(DRAG_COMPLETION_TIMEOUT_MS + 10);
      });

      // Should broadcast the collected path as paste (includes starting quote)
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '',
          paste: true,
          sequence: `${SINGLE_QUOTE}a`,
        }),
      );
    });

    it('should collect multiple characters and complete on timeout', async () => {
      const keyHandler = vi.fn();

      const { result } = renderHook(() => useKeypressContext(), { wrapper });

      act(() => {
        result.current.subscribe(keyHandler);
      });

      // Start by single quote
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: SINGLE_QUOTE,
        });
      });

      // Send multiple characters
      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'p',
        });
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'a',
        });
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 't',
        });
      });

      act(() => {
        stdin.pressKey({
          name: undefined,
          ctrl: false,
          meta: false,
          shift: false,
          paste: false,
          sequence: 'h',
        });
      });

      // Characters should not be immediately broadcast
      expect(keyHandler).not.toHaveBeenCalled();

      // Fast-forward to completion timeout
      act(() => {
        vi.advanceTimersByTime(DRAG_COMPLETION_TIMEOUT_MS + 10);
      });

      // Should broadcast the collected path as paste (includes starting quote)
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '',
          paste: true,
          sequence: `${SINGLE_QUOTE}path`,
        }),
      );
    });
  });
});
