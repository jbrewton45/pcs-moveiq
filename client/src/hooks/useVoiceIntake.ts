import { useState, useRef, useCallback } from "react";

// Web Speech API types — same declarations as VoiceCapture.tsx
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

const SpeechAPI: (new () => SpeechRecognitionInstance) | null =
  typeof window !== "undefined"
    ? (window as unknown as Record<string, unknown>).SpeechRecognition as typeof SpeechAPI ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition as typeof SpeechAPI ??
      null
    : null;

export const VOICE_AVAILABLE = SpeechAPI !== null;

export type VoiceState = "idle" | "recording" | "done";

const SILENCE_TIMEOUT_MS = 3000;

/**
 * Lightweight voice intake hook for the dashboard.
 * Returns a transcript string that the caller can pass to addItem().
 * Does NOT call any API — just captures speech to text.
 */
export function useVoiceIntake() {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const startRecording = useCallback(() => {
    if (!SpeechAPI) {
      setError("Speech recognition not available in this browser");
      return;
    }

    setTranscript("");
    setError(null);
    setState("recording");

    const recognition = new SpeechAPI();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          text += event.results[i][0].transcript;
        }
      }
      if (text) {
        setTranscript(prev => (prev ? prev + " " + text.trim() : text.trim()));
      }
      // Reset silence timer on each result
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        stopRecording();
        setState("done");
      }, SILENCE_TIMEOUT_MS);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") {
        setError(`Speech error: ${event.error}`);
      }
      setState("idle");
      stopRecording();
    };

    recognition.onend = () => {
      setState(prev => prev === "recording" ? "done" : prev);
    };

    recognition.start();

    // Auto-stop after silence
    silenceTimerRef.current = setTimeout(() => {
      stopRecording();
      setState("done");
    }, SILENCE_TIMEOUT_MS);
  }, [stopRecording]);

  const reset = useCallback(() => {
    stopRecording();
    setState("idle");
    setTranscript("");
    setError(null);
  }, [stopRecording]);

  return {
    state,
    transcript,
    error,
    startRecording,
    stopRecording: useCallback(() => { stopRecording(); setState("done"); }, [stopRecording]),
    reset,
    isAvailable: VOICE_AVAILABLE,
  };
}
