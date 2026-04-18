import { useState } from "react";
import type { Item } from "../../types";

export interface SoldPriceSheetProps {
  item: Item;
  onClose: () => void;
  onMarkSold: (soldPriceUsd?: number) => Promise<void> | void;
}

export function SoldPriceSheet({
  item, onClose, onMarkSold,
}: SoldPriceSheetProps) {
  const listedPrice = item.priceFairMarket ?? item.priceFastSale ?? 0;
  const initialInput = listedPrice > 0 ? Math.round(listedPrice).toString() : "";
  const [priceInput, setPriceInput] = useState(initialInput);
  const [busy, setBusy] = useState(false);

  const parsedPrice = (() => {
    const n = Number(priceInput);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  })();

  const headline = listedPrice > 0
    ? `You listed this at $${Math.round(listedPrice)} — what did it sell for?`
    : "What did it sell for?";

  const handleSave = async () => {
    setBusy(true);
    try { await onMarkSold(parsedPrice); } finally { setBusy(false); }
  };
  const handleSkip = async () => {
    setBusy(true);
    try { await onMarkSold(undefined); } finally { setBusy(false); }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10003,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "var(--bg-card, #fff)",
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          padding: "20px 16px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>
            {headline}
          </h3>
          <button onClick={onClose} aria-label="Close"
            style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer", color: "var(--text-secondary)", lineHeight: 1 }}>×</button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-secondary)" }}>
          Entering the price is optional — it helps track revenue and will tune future recommendations.
        </p>

        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            Sold price (USD)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-muted)" }}>$</span>
            <input
              autoFocus
              value={priceInput}
              inputMode="decimal"
              pattern="[0-9]*\\.?[0-9]*"
              onChange={(e) => setPriceInput(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0"
              style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 16, fontWeight: 600 }}
            />
          </div>
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleSkip}
            disabled={busy}
            style={{
              flex: 1, padding: "12px 14px",
              border: "1px solid var(--border-soft)", borderRadius: 8,
              background: "var(--bg-elevated, #f8fafc)",
              fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer",
              color: "var(--text-secondary)",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Skip — just mark sold
          </button>
          <button
            onClick={handleSave}
            disabled={busy || parsedPrice === undefined}
            style={{
              flex: 1, padding: "12px 14px",
              border: "none", borderRadius: 8,
              background: "#22c55e", color: "#fff",
              fontSize: 14, fontWeight: 700,
              cursor: (busy || parsedPrice === undefined) ? "default" : "pointer",
              opacity: (busy || parsedPrice === undefined) ? 0.5 : 1,
            }}
          >
            {busy ? "Saving…" : parsedPrice !== undefined ? `Save $${parsedPrice}` : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
