import { useEffect, useRef, useState } from 'react';

export interface VoiceRecognitionResultItem extends ArrayLike<{ transcript: string }> {
  isFinal: boolean;
}

export interface VoiceRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<VoiceRecognitionResultItem>;
}

export interface VoiceRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type VoiceRecognitionCtor = new () => VoiceRecognitionLike;

function getSpeechRecognitionCtor(): VoiceRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: VoiceRecognitionCtor;
    webkitSpeechRecognition?: VoiceRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function describeVoiceError(code: string): string {
  switch (code) {
    case 'not-allowed':
      return "Microphone access is blocked — check this site's permissions.";
    case 'service-not-allowed':
      return "Voice recognition isn't available on this device.";
    case 'no-speech':
      return "Didn't catch that — try again.";
    case 'audio-capture':
      return 'No microphone was found.';
    case 'network':
      return 'Voice input needs an internet connection.';
    default:
      return 'Voice input failed. Try again.';
  }
}

const RETRY_DELAYS_MS = [300, 1000, 2000, 3500];
const SILENCE_WATCHDOG_MS = 8000;
const PERMISSION_PROMPT_WATCHDOG_MS = 30_000;
const MAX_SESSION_MS = 60_000;
const UNRESPONSIVE_MESSAGE =
  "Voice input isn't responding right now — tap the mic and try again.";
const TIMEOUT_MESSAGE = 'Voice input timed out — try again.';

const PERMISSION_ERROR_CODES = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

interface VoiceSession {
  optionsRef: { current: { onTranscript: (text: string) => void } };
  recognition: VoiceRecognitionLike | null;
  active: boolean;
  discarded: boolean;
  failures: number;
  recordingStart: number;
  interval: ReturnType<typeof setInterval> | null;
  watchdog: ReturnType<typeof setTimeout> | null;
  retryTimeout: ReturnType<typeof setTimeout> | null;
  sessionCap: ReturnType<typeof setTimeout> | null;
  setListening: (value: boolean) => void;
  setRecordingMs: (value: number) => void;
  setVoiceError: (value: string | null) => void;
}

function getNavigatorMedia(): MediaDevices['getUserMedia'] | undefined {
  return typeof navigator !== 'undefined' ? navigator.mediaDevices?.getUserMedia : undefined;
}

function armStartupWatchdog(session: VoiceSession, recognition: VoiceRecognitionLike) {
  const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
  if (!permissions?.query) {
    armWatchdog(session);
    return;
  }
  const armAfterPermissionCheck = (state: string | null) => {
    if (!session.active || session.discarded || session.watchdog) return;
    if (session.recognition !== recognition) return;
    armWatchdog(session, state === 'prompt' ? PERMISSION_PROMPT_WATCHDOG_MS : SILENCE_WATCHDOG_MS);
  };
  permissions
    .query({ name: 'microphone' as PermissionName })
    .then((status) => armAfterPermissionCheck(status.state))
    .catch(() => armAfterPermissionCheck(null));
}

function detachHandlers(recognition: VoiceRecognitionLike | null) {
  if (!recognition) return;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

function hardAbort(recognition: VoiceRecognitionLike | null) {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch {
    /* already dead */
  }
  try {
    recognition.abort?.();
  } catch {
    /* already dead */
  }
}

function clearWatchdog(session: VoiceSession) {
  if (session.watchdog) {
    clearTimeout(session.watchdog);
    session.watchdog = null;
  }
}

function clearTimers(session: VoiceSession) {
  if (session.interval) {
    clearInterval(session.interval);
    session.interval = null;
  }
  clearWatchdog(session);
  if (session.retryTimeout) {
    clearTimeout(session.retryTimeout);
    session.retryTimeout = null;
  }
  if (session.sessionCap) {
    clearTimeout(session.sessionCap);
    session.sessionCap = null;
  }
}

function finishSession(session: VoiceSession, opts: { error?: string } = {}) {
  session.active = false;
  clearTimers(session);
  detachHandlers(session.recognition);
  hardAbort(session.recognition);
  session.recognition = null;
  session.setListening(false);
  session.setRecordingMs(0);
  if (opts.error) session.setVoiceError(opts.error);
}

function armWatchdog(session: VoiceSession, delayMs: number = SILENCE_WATCHDOG_MS) {
  clearWatchdog(session);
  session.watchdog = setTimeout(() => {
    session.watchdog = null;
    if (!session.active || session.discarded) return;
    detachHandlers(session.recognition);
    hardAbort(session.recognition);
    session.recognition = null;
    scheduleRetry(session);
  }, delayMs);
}

function scheduleRetry(session: VoiceSession) {
  session.failures += 1;
  if (session.failures > RETRY_DELAYS_MS.length) {
    finishSession(session, { error: UNRESPONSIVE_MESSAGE });
    return;
  }
  const delay = RETRY_DELAYS_MS[session.failures - 1];
  session.retryTimeout = setTimeout(() => beginAttempt(session), delay);
}

function beginAttempt(session: VoiceSession) {
  if (!session.active || session.discarded) return;
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    finishSession(session);
    return;
  }

  let finalText = '';
  let gotText = false;

  const recognition = new Ctor();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    armWatchdog(session);
    if (!session.active || session.discarded) return;
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const alternative = result?.[0];
      if (!alternative?.transcript) continue;
      if (result.isFinal) finalText += alternative.transcript;
      else interim += alternative.transcript;
    }
    const text = `${finalText}${interim}`.trim();
    if (text) {
      gotText = true;
      session.optionsRef.current.onTranscript(text);
    }
  };

  recognition.onerror = (event) => {
    armWatchdog(session);
    if (!session.active || session.discarded) return;
    if (PERMISSION_ERROR_CODES.has(event.error) || event.error === 'network') {
      finishSession(session, { error: describeVoiceError(event.error) });
    }
  };

  recognition.onend = () => {
    armWatchdog(session);
    if (session.discarded) {
      finishSession(session);
      return;
    }
    if (gotText) {
      finishSession(session);
      return;
    }
    scheduleRetry(session);
  };

  session.recognition = recognition;
  try {
    recognition.start();
  } catch {
    session.recognition = null;
    scheduleRetry(session);
    return;
  }
  armStartupWatchdog(session, recognition);
}

function primeMicrophone(warmedUpRef: { current: boolean }) {
  if (warmedUpRef.current) return;
  warmedUpRef.current = true;
  const getUserMedia = getNavigatorMedia();
  if (!getUserMedia) return;
  getUserMedia({ audio: true })
    .then((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    })
    .catch(() => {});
}

export function useVoiceInput(options: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const voiceSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognitionCtor());

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const sessionRef = useRef<VoiceSession>({
    optionsRef,
    recognition: null,
    active: false,
    discarded: false,
    failures: 0,
    recordingStart: 0,
    interval: null,
    watchdog: null,
    retryTimeout: null,
    sessionCap: null,
    setListening,
    setRecordingMs,
    setVoiceError,
  });

  const warmedUpRef = useRef(false);

  const startListening = () => {
    const session = sessionRef.current;
    if (session.active) return;
    primeMicrophone(warmedUpRef);

    session.discarded = false;
    session.failures = 0;
    setVoiceError(null);
    setRecordingMs(0);
    session.recordingStart = Date.now();

    session.active = true;
    setListening(true);
    session.interval = setInterval(() => {
      setRecordingMs(Date.now() - session.recordingStart);
    }, 200);

    session.sessionCap = setTimeout(() => {
      if (session.active && !session.discarded) {
        finishSession(session, { error: TIMEOUT_MESSAGE });
      }
    }, MAX_SESSION_MS);

    beginAttempt(session);
  };

  const stopListening = () => {
    const session = sessionRef.current;
    if (!session.active) return;
    finishSession(session);
  };

  const cancelRecording = () => {
    const session = sessionRef.current;
    if (!session.active) return;
    session.discarded = true;
    finishSession(session);
  };

  useEffect(() => {
    const session = sessionRef.current;
    const handleVisibilityChange = () => {
      if (document.hidden && session.active && !session.discarded) {
        finishSession(session);
      }
    };
    const warmOnFirstGesture = () => primeMicrophone(warmedUpRef);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('pointerdown', warmOnFirstGesture, { once: true });
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('pointerdown', warmOnFirstGesture);
      session.discarded = true;
      finishSession(session);
    };
  }, []);

  return {
    listening,
    recordingMs,
    voiceError,
    voiceSupported,
    startListening,
    stopListening,
    cancelRecording,
  };
}
