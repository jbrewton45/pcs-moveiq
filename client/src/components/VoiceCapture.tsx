// Web Speech API types — available in Chrome/Android WebView
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
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

import { useEffect, useRef, useState } from "react";
import type { ItemCondition, SizeClass } from "../types";
import { api } from "../api";

interface VoiceCaptureProps {
  projectId: string;
  roomId: string;
  roomType?: string;
  onItemCreated: () => void;
  onCancel: () => void;
}

type CaptureState = "idle" | "recording" | "parsing" | "draft";

interface DraftFields {
  itemName: string;
  category: string;
  condition: ItemCondition;
  sizeClass: SizeClass;
  notes: string;
  willingToSell: boolean;
  keepFlag: boolean;
  sentimentalFlag: boolean;
}

const CONDITIONS: ItemCondition[] = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"];
const SIZE_CLASSES: SizeClass[] = ["SMALL", "MEDIUM", "LARGE", "OVERSIZED"];

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SPEECH_API_AVAILABLE =
  typeof window !== "undefined" &&
  !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

const SILENCE_TIMEOUT_MS = 10_000;

export function VoiceCapture({
  projectId,
  roomId,
  roomType,
  onItemCreated,
  onCancel,
}: VoiceCaptureProps) {
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<DraftFields>({
    itemName: "",
    category: "",
    condition: "GOOD",
    sizeClass: "MEDIUM",
    notes: "",
    willingToSell: false,
    keepFlag: false,
    sentimentalFlag: false,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  function resetSilenceTimer() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      stopRecording();
    }, SILENCE_TIMEOUT_MS);
  }

  function startRecording() {
    setError("");
    setFinalTranscript("");
    setInterimTranscript("");

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      resetSilenceTimer();
      let newFinal = "";
      let newInterim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinal += result[0].transcript;
        } else {
          newInterim += result[0].transcript;
        }
      }
      if (newFinal) {
        setFinalTranscript((prev) => (prev ? prev + " " + newFinal : newFinal));
      }
      setInterimTranscript(newInterim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access denied. Please allow microphone access and try again.");
      } else if (event.error === "no-speech") {
        // non-fatal — silence timer will handle auto-stop
        return;
      } else {
        setError("Voice not available, type instead.");
      }
      setCaptureState("idle");
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      // Only transition if we are still in "recording" state (not already stopped manually)
      setCaptureState((prev) => {
        if (prev === "recording") {
          // Trigger parse via a side-effect below
          return "parsing";
        }
        return prev;
      });
    };

    recognitionRef.current = recognition;
    recognition.start();
    setCaptureState("recording");
    resetSilenceTimer();
  }

  function stopRecording() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    recognitionRef.current?.stop();
    // onend fires next and transitions state to "parsing"
  }

  // When state becomes "parsing", call the API
  useEffect(() => {
    if (captureState !== "parsing") return;

    const transcript = finalTranscript.trim();
    if (!transcript) {
      setError("No speech detected. Tap the mic and try again.");
      setCaptureState("idle");
      return;
    }

    let cancelled = false;
    api
      .parseVoiceTranscript(transcript, roomType)
      .then((parsed) => {
        if (cancelled) return;
        setDraft({
          itemName: parsed.itemName ?? "",
          category: parsed.category ?? "",
          condition: (parsed.condition as ItemCondition) ?? "GOOD",
          sizeClass: (parsed.sizeClass as SizeClass) ?? "MEDIUM",
          notes: parsed.notes ?? "",
          willingToSell: parsed.willingToSell ?? false,
          keepFlag: parsed.keepFlag ?? false,
          sentimentalFlag: parsed.sentimentalFlag ?? false,
        });
        setCaptureState("draft");
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: pre-fill only the transcript as the item name so the
        // user can still quickly save without a complete parse.
        setDraft((prev) => ({ ...prev, itemName: transcript }));
        setCaptureState("draft");
      });

    return () => {
      cancelled = true;
    };
  }, [captureState]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await api.createItem({
        projectId,
        roomId,
        itemName: draft.itemName,
        category: draft.category,
        condition: draft.condition,
        sizeClass: draft.sizeClass,
        notes: draft.notes || undefined,
        willingToSell: draft.willingToSell,
        keepFlag: draft.keepFlag,
        sentimentalFlag: draft.sentimentalFlag,
      });
      onItemCreated();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setCaptureState("idle");
    setFinalTranscript("");
    setInterimTranscript("");
    setError("");
  }

  // ── Unsupported browser ──────────────────────────────────────────────────
  if (!SPEECH_API_AVAILABLE) {
    return (
      <div className="voice-capture">
        <p className="voice-capture__unsupported">
          Voice capture is not supported in this browser. Use the text form to add an item.
        </p>
        <button className="btn-cancel" type="button" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  // ── Idle ─────────────────────────────────────────────────────────────────
  if (captureState === "idle") {
    return (
      <div className="voice-capture">
        <div className="voice-capture__mic-area">
          <button
            className="voice-capture__mic-btn"
            type="button"
            aria-label="Start voice capture"
            onClick={startRecording}
          >
            🎤
          </button>
          <span className="voice-capture__mic-label">Tap to speak</span>
          {error && <p className="voice-capture__error">{error}</p>}
        </div>
        <button className="btn-cancel" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  // ── Recording ────────────────────────────────────────────────────────────
  if (captureState === "recording") {
    const hasText = finalTranscript || interimTranscript;
    return (
      <div className="voice-capture">
        <div className="voice-capture__mic-area">
          <button
            className="voice-capture__mic-btn voice-capture__mic-btn--recording"
            type="button"
            aria-label="Stop recording"
            onClick={stopRecording}
          >
            ⏹
          </button>
          <span className="voice-capture__mic-label">Recording — tap to stop</span>
        </div>
        {hasText && (
          <div className="voice-capture__transcript">
            {finalTranscript && <span>{finalTranscript} </span>}
            {interimTranscript && (
              <span className="voice-capture__transcript--interim">
                {interimTranscript}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Parsing ──────────────────────────────────────────────────────────────
  if (captureState === "parsing") {
    return (
      <div className="voice-capture">
        <p className="voice-capture__parsing">Parsing your description...</p>
      </div>
    );
  }

  // ── Draft ────────────────────────────────────────────────────────────────
  return (
    <div className="voice-capture">
      <div className="voice-capture__draft-header">
        <h4 className="voice-capture__draft-title">Review &amp; Save</h4>
      </div>

      <form onSubmit={handleSaveDraft}>
        {saveError && <p className="voice-capture__error">{saveError}</p>}

        <label className="item-edit-form" style={{ display: "block", marginBottom: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Item Name
          <input
            type="text"
            value={draft.itemName}
            onChange={(e) => setDraft((d) => ({ ...d, itemName: e.target.value }))}
            required
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem", fontSize: "1rem", border: "1px solid var(--color-border, #ccc)", borderRadius: "0.375rem", background: "var(--color-bg, #fff)", color: "inherit", boxSizing: "border-box" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Category
          <input
            type="text"
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            required
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem", fontSize: "1rem", border: "1px solid var(--color-border, #ccc)", borderRadius: "0.375rem", background: "var(--color-bg, #fff)", color: "inherit", boxSizing: "border-box" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Condition
          <select
            value={draft.condition}
            onChange={(e) => setDraft((d) => ({ ...d, condition: e.target.value as ItemCondition }))}
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem", fontSize: "1rem", border: "1px solid var(--color-border, #ccc)", borderRadius: "0.375rem", background: "var(--color-bg, #fff)", color: "inherit", boxSizing: "border-box" }}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{label(c)}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block", marginBottom: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Size
          <select
            value={draft.sizeClass}
            onChange={(e) => setDraft((d) => ({ ...d, sizeClass: e.target.value as SizeClass }))}
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem", fontSize: "1rem", border: "1px solid var(--color-border, #ccc)", borderRadius: "0.375rem", background: "var(--color-bg, #fff)", color: "inherit", boxSizing: "border-box" }}
          >
            {SIZE_CLASSES.map((s) => (
              <option key={s} value={s}>{label(s)}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "block", marginBottom: "0.75rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Notes (optional)
          <textarea
            rows={2}
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="Any context, measurements, or reminders..."
            style={{ display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem", fontSize: "1rem", fontFamily: "inherit", border: "1px solid var(--color-border, #ccc)", borderRadius: "0.375rem", background: "var(--color-bg, #fff)", color: "inherit", boxSizing: "border-box", resize: "vertical", minHeight: "2.5rem" }}
          />
        </label>

        <div className="checkbox-row">
          <input
            id="voice-sentimental"
            type="checkbox"
            checked={draft.sentimentalFlag}
            onChange={(e) => setDraft((d) => ({ ...d, sentimentalFlag: e.target.checked }))}
          />
          <label htmlFor="voice-sentimental" style={{ marginBottom: 0 }}>
            Sentimental
          </label>
        </div>

        <div className="checkbox-row">
          <input
            id="voice-keep"
            type="checkbox"
            checked={draft.keepFlag}
            onChange={(e) => setDraft((d) => ({ ...d, keepFlag: e.target.checked }))}
          />
          <label htmlFor="voice-keep" style={{ marginBottom: 0 }}>
            Keep (not for sale/donation)
          </label>
        </div>

        <div className="checkbox-row">
          <input
            id="voice-willingtosell"
            type="checkbox"
            checked={draft.willingToSell}
            onChange={(e) => setDraft((d) => ({ ...d, willingToSell: e.target.checked }))}
          />
          <label htmlFor="voice-willingtosell" style={{ marginBottom: 0 }}>
            Willing to Sell
          </label>
        </div>

        <div className="voice-capture__draft-actions">
          <button
            className="btn-cancel voice-capture__draft-actions btn-cancel"
            type="button"
            onClick={handleDiscard}
          >
            Discard
          </button>
          <button
            className="btn-save"
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Item"}
          </button>
        </div>
      </form>
    </div>
  );
}
