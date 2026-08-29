"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Wraps the browser's native Web Speech API — no server, no API key, no
 * added infrastructure. On the S24 Ultra's default browser (Chrome for
 * Android) this supports Tamil (ta-IN) and Indian English (en-IN) directly.
 * It is what's actually implemented today; VOICE_AGENT_ARCHITECTURE.md
 * documents AI4Bharat IndicConformer/IndicF5 as the higher-accuracy,
 * code-switching-aware upgrade path, which needs a GPU server this
 * environment does not have.
 *
 * Minimal local typing — `SpeechRecognition` isn't in TypeScript's DOM lib,
 * and only Chrome ships it prefixed.
 */
interface MinimalSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: { transcript: string; isFinal: boolean }[][] } & { resultIndex: number }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(lang: "ta-IN" | "en-IN") {
  // Optimistic until a start() attempt proves otherwise — checking at mount
  // via an effect would set state synchronously on first render for no
  // benefit, since `start()` already reports unsupported the moment it's
  // actually tried.
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  const start = useCallback(
    (onFinalTranscript: (text: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setSupported(false);
        return;
      }

      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1]?.[0]?.transcript;
        if (transcript) onFinalTranscript(transcript);
      };
      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "permission-denied") {
          setPermissionDenied(true);
        }
        setListening(false);
      };
      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    },
    [lang]
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, permissionDenied, start, stop };
}

/** Speaks text aloud using the browser's built-in TTS, best-effort — never blocks the UI if unavailable. */
export function speak(text: string, lang: "ta-IN" | "en-IN") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2)));
    if (match) utterance.voice = match;
    window.speechSynthesis.cancel(); // don't stack replies if the owner sends several turns quickly
    window.speechSynthesis.speak(utterance);
  } catch {
    // TTS is a nicety; a failure here must never surface as an app error.
  }
}
