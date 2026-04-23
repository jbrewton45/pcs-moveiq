import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ToastTone = "success" | "info" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_MS = 2400;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 88,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          pointerEvents: "none",
          zIndex: 1000,
          padding: "0 16px",
        }}
      >
        {items.map((t) => (
          <ToastRow key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const toneColors: Record<ToastTone, { bg: string; fg: string; border: string }> = {
    success: { bg: "rgba(34,197,94,0.95)", fg: "#fff", border: "rgba(34,197,94,1)" },
    info:    { bg: "rgba(59,130,246,0.95)", fg: "#fff", border: "rgba(59,130,246,1)" },
    error:   { bg: "rgba(239,68,68,0.95)", fg: "#fff", border: "rgba(239,68,68,1)" },
  };
  const c = toneColors[item.tone];
  return (
    <button
      type="button"
      onClick={onDismiss}
      style={{
        pointerEvents: "auto",
        maxWidth: 420,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 999,
        padding: "8px 16px",
        fontSize: 14,
        fontWeight: 600,
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        cursor: "pointer",
        transition: "transform 180ms ease, opacity 180ms ease",
        transform: mounted ? "translateY(0)" : "translateY(8px)",
        opacity: mounted ? 1 : 0,
      }}
    >
      {item.message}
    </button>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { showToast: () => {} };
  }
  return ctx;
}
