import { useEffect, useState } from "react";
import type { CategoryCalibration, CalibrationConfidence } from "../types";
import { api } from "../api";

/**
 * "How your items are selling" — a collapsible diagnostics panel that shows
 * per-category realized-vs-estimate ratios with a confidence indicator.
 * Fetches /api/calibration?projectId=... and renders one row per qualifying
 * category. Hidden entirely when the project has no qualifying categories.
 */
export interface CalibrationPanelProps {
  projectId: string;
  /** Bump to force a re-fetch after sales / actions. */
  refreshKey?: number;
}

const CONFIDENCE_DOT: Record<CalibrationConfidence, string> = {
  high: "🟢",
  medium: "🟡",
  low: "🔴",
};

const CONFIDENCE_LABEL: Record<CalibrationConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

function formatCategory(raw: string): string {
  // Preserve the user's original casing for display; just title-case lowercase-only strings.
  if (raw !== raw.toLowerCase()) return raw;
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CalibrationPanel({ projectId, refreshKey }: CalibrationPanelProps) {
  const [rows, setRows] = useState<CategoryCalibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getCalibration(projectId)
      .then((list) => { if (!cancelled) setRows(list); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  if (loading) return null;
  if (rows.length === 0) return null;

  const totalSales = rows.reduce((s, r) => s + r.sampleSize, 0);

  return (
    <section
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
        margin: "12px 0",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10,
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
            📈 How your items are selling
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {rows.length} categor{rows.length === 1 ? "y" : "ies"} calibrated · {totalSales} sale{totalSales === 1 ? "" : "s"} tracked
          </div>
        </div>
        <span
          aria-hidden
          style={{
            color: "var(--text-muted)", fontSize: 14, flexShrink: 0,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 120ms ease",
          }}
        >
          ▸
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border-soft)", padding: "10px 16px 14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r) => {
              const pct = Math.round(r.multiplier * 100);
              const displayName = formatCategory(r.category);
              return (
                <div
                  key={r.category}
                  title={CONFIDENCE_LABEL[r.confidence]}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px",
                    background: "var(--bg-elevated, #f8fafc)",
                    border: "1px solid var(--border-soft)",
                    borderRadius: 8,
                  }}
                >
                  <span aria-hidden style={{ fontSize: 12, flexShrink: 0 }}>
                    {CONFIDENCE_DOT[r.confidence]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      ~{pct}% of estimate · {r.sampleSize} sale{r.sampleSize === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 13, fontWeight: 700, color: "var(--text-primary)",
                      background: "var(--bg-card, #fff)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: 999, padding: "2px 10px", flexShrink: 0,
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, marginBottom: 0, lineHeight: 1.4 }}>
            Multipliers are based on your own sold prices vs. original estimates.
            Categories need at least 3 sales to appear here.
          </p>
        </div>
      )}
    </section>
  );
}
