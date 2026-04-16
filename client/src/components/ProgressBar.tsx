import { useMemo } from "react";
import type { Item } from "../types";
import { computeCompletion } from "../lib/progress";

interface Props {
  items: Item[];
  label?: string;
  compact?: boolean;
}

const BAR_BG = "rgba(148, 163, 184, 0.15)";

function fillColor(pct: number): string {
  if (pct >= 100) return "#22c55e";
  if (pct >= 75) return "#3b82f6";
  if (pct >= 40) return "#eab308";
  return "#f97316";
}

export function ProgressBar({ items, label, compact }: Props) {
  const { total, completed, remaining, percentComplete } = useMemo(
    () => computeCompletion(items),
    [items],
  );

  if (total === 0) return null;

  const color = fillColor(percentComplete);
  const barHeight = compact ? 6 : 8;

  return (
    <div
      style={{
        padding: compact ? "8px 0" : "12px 14px",
        background: compact ? "transparent" : "var(--bg-card)",
        border: compact ? "none" : "1px solid var(--border-soft)",
        borderRadius: compact ? 0 : "var(--radius-md)",
        marginBottom: compact ? 0 : "var(--space-3)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          {label ?? "Progress"}
        </span>
        <span
          style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 700,
            color: percentComplete >= 100 ? "#22c55e" : "var(--text-primary)",
          }}
        >
          {percentComplete}%
          {!compact && (
            <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
              {completed}/{total} done
            </span>
          )}
        </span>
      </div>

      <div
        style={{
          height: barHeight,
          borderRadius: barHeight / 2,
          background: BAR_BG,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percentComplete}%`,
            borderRadius: barHeight / 2,
            background: color,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {!compact && remaining > 0 && (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          {remaining} item{remaining === 1 ? "" : "s"} remaining
        </p>
      )}
    </div>
  );
}
