import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceInput } from './useVoiceInput';

interface MockResultItem {
  0: { transcript: string };
  length: number;
  isFinal: boolean;
}

const RETRY_DELAYS_MS = [300, 1000, 2000, 3500];
const WATCHDOG_MS = 8000;
const PROMPT_WATCHDOG_MS = 30_000;

class MockRecognition {
  static instances: MockRecognition[] = [];

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  started = false;

  onresult: ((event: { resultIndex: number; results: MockResultItem[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    MockRecognition.instances.push(this);
  }

  start() {
    this.started = true;
    sequence.push(`start:${MockRecognition.instances.length}`);
  }

  stop() {}

  abort() {}

  emit(transcript: string, isFinal: boolean) {
    this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript }, length: 1, isFinal }] });
  }

  emitError(code: string) {
    this.onerror?.({ error: code });
  }

  end() {
    this.onend?.();
  }
}

let sequence: string[];
const getUserMedia = vi.fn(async () => ({ getTracks: () => [] }) as unknown as MediaStream);

function setupBrowserMocks() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: MockRecognition,
  });
}

async function startListeningHook() {
  const onTranscript = vi.fn();
  const rendered = renderHook(() => useVoiceInput({ onTranscript }));
  act(() => rendered.result.current.startListening());
  await act(async () => {});
  return { ...rendered, onTranscript };
}

describe('useVoiceInput', () => {
  beforeEach(() => {
    sequence = [];
    MockRecognition.instances = [];
    getUserMedia.mockClear();
    setupBrowserMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    delete (navigator as { permissions?: unknown }).permissions;
  });

  it('primes the microphone and starts recognition with interim results enabled', async () => {
    const { result } = await startListeningHook();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.listening).toBe(true);
    expect(MockRecognition.instances).toHaveLength(1);
    expect(MockRecognition.instances[0].started).toBe(true);
    expect(MockRecognition.instances[0].interimResults).toBe(true);
  });

  it('recovers when the recognizer silently hangs without firing any events', async () => {
    const { result } = await startListeningHook();

    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      act(() => {
        vi.advanceTimersByTime(WATCHDOG_MS);
      });
      act(() => {
        vi.advanceTimersByTime(RETRY_DELAYS_MS[i]);
      });
    }

    expect(MockRecognition.instances).toHaveLength(RETRY_DELAYS_MS.length + 1);

    act(() => {
      vi.advanceTimersByTime(WATCHDOG_MS);
    });

    expect(result.current.listening).toBe(false);
    expect(result.current.voiceError).toMatch(/try again/i);
  });

  it('does not retry after a permission denial and surfaces the reason', async () => {
    const { result } = await startListeningHook();

    act(() => {
      MockRecognition.instances[0].emitError('not-allowed');
    });

    expect(result.current.voiceError).toMatch(/blocked/i);

    act(() => {
      vi.advanceTimersByTime(WATCHDOG_MS + 5000);
    });

    expect(MockRecognition.instances).toHaveLength(1);
    expect(result.current.listening).toBe(false);
  });

  it('treats missing device speech services as unavailable, not blocked', async () => {
    const { result } = await startListeningHook();

    act(() => {
      MockRecognition.instances[0].emitError('service-not-allowed');
    });

    expect(result.current.voiceError).toMatch(/device/i);
  });

  it('waits for the mic permission prompt before declaring a silent hang', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn(async () => ({ state: 'prompt' })) },
    });
    const { result } = await startListeningHook();

    act(() => {
      vi.advanceTimersByTime(WATCHDOG_MS);
    });
    expect(MockRecognition.instances).toHaveLength(1);
    expect(result.current.listening).toBe(true);

    act(() => {
      vi.advanceTimersByTime(PROMPT_WATCHDOG_MS - WATCHDOG_MS);
    });
    act(() => {
      vi.advanceTimersByTime(RETRY_DELAYS_MS[0]);
    });

    expect(MockRecognition.instances).toHaveLength(2);
  });

  it('streams interim transcripts then finalizes without duplicating text', async () => {
    const { result, onTranscript } = await startListeningHook();

    act(() => {
      MockRecognition.instances[0].emit('spent fifty', false);
    });
    expect(onTranscript).toHaveBeenLastCalledWith('spent fifty');

    act(() => {
      MockRecognition.instances[0].emit('spent fifty on', false);
    });
    expect(onTranscript).toHaveBeenLastCalledWith('spent fifty on');

    act(() => {
      MockRecognition.instances[0].emit('spent fifty on food', true);
    });
    expect(onTranscript).toHaveBeenLastCalledWith('spent fifty on food');

    act(() => {
      MockRecognition.instances[0].end();
    });

    expect(result.current.listening).toBe(false);
    expect(result.current.voiceError).toBeNull();
  });

  it('stops cleanly after a normal end without spawning retries', async () => {
    const { result } = await startListeningHook();

    act(() => {
      MockRecognition.instances[0].emit('bought coffee', true);
    });
    act(() => {
      MockRecognition.instances[0].end();
    });

    const attempts = MockRecognition.instances.length;
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(MockRecognition.instances).toHaveLength(attempts);
    expect(result.current.listening).toBe(false);
  });

  it('discard-cancel ignores late transcripts and never restarts', async () => {
    const { result, onTranscript } = await startListeningHook();

    act(() => {
      result.current.cancelRecording();
    });
    expect(result.current.listening).toBe(false);

    act(() => {
      MockRecognition.instances[0].emit('accidental', true);
    });
    act(() => {
      MockRecognition.instances[0].end();
    });
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(MockRecognition.instances).toHaveLength(1);
  });

  it('ends the session instead of recording forever past the session cap', async () => {
    const { result } = await startListeningHook();

    for (let i = 0; i < 11; i++) {
      act(() => {
        vi.advanceTimersByTime(5000);
        MockRecognition.instances[0].emit('blah', false);
      });
    }

    expect(result.current.listening).toBe(true);

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(result.current.listening).toBe(false);
    expect(result.current.voiceError).toMatch(/timed out/i);
    expect(MockRecognition.instances).toHaveLength(1);
  });

  it('stops listening when the page goes to the background', async () => {
    const { result } = await startListeningHook();

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.listening).toBe(false);
  });
});
