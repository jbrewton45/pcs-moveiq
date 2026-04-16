import { useEffect, useState } from "react";
import type { Item } from "../types";
import { api } from "../api";

/**
 * Project-level revenue summary. Renders a small "X items sold · $Y recovered"
 * card whenever at least one item in the project has status === "SOLD".
 * Pure client-side aggregation over the existing /api/items list — no new
 * endpoint required.
 */
export interface RevenueSummaryProps {
  projectId: string;
  /** Bump to force a refresh (e.g. after a placement/action change). */
  refreshKey?: number;
}

export function RevenueSummary({ projectId, refreshKey }: RevenueSummaryProps) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.listItems({ projectId })
      .then((list) => { if (!cancelled) setItems(list); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  const soldItems = items.filter((it) => it.status === "SOLD");
  const totalRecovered = soldItems.reduce(
    (sum, it) => sum + (typeof it.soldPriceUsd === "number" ? it.soldPriceUsd : 0),
    0
  );
  const soldWithPrice = soldItems.filter(
    (it) => typeof it.soldPriceUsd === "number" && it.soldPriceUsd > 0
  ).length;

  if (soldItems.length === 0) return null;

  const formattedTotal = totalRecovered > 0
    ? `$${Math.round(totalRecovered).toLocaleString()}`
    : null;

  return (
    <section
      style={{
        background: "rgba(34, 197, 94, 0.08)",
        border: "1px solid rgba(34, 197, 94, 0.30)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
        margin: "12px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          💰 {soldItems.length} item{soldItems.length === 1 ? "" : "s"} sold
        </div>
        {formattedTotal ? (
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", marginTop: 2, lineHeight: 1.1 }}>
            {formattedTotal} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>recovered</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Add sell prices to track recovered value.
          </div>
        )}
      </div>
      {soldItems.length > 0 && (
        <div
          style={{
            fontSize: 10, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.06em",
            textAlign: "right", flexShrink: 0,
          }}
          aria-hidden
        >
          {soldWithPrice} with price<br />
          {soldItems.length - soldWithPrice} without
        </div>
      )}
    </section>
  );
}
