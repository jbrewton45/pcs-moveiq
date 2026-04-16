import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { DecisionBucket, Item, ItemDecisionAction, PrioritizedItem, ScoreBreakdown } from "../types";
import { api } from "../api";

// Long-press to enter selection mode: finger-down for this long without
// moving more than DRAG_CANCEL_PX triggers multi-select.
const LONG_PRESS_MS = 450;
const DRAG_CANCEL_PX = 8;

// Local color map — match RoomViewer's 4 sell/keep/ship/donate colors.
const BUCKET_COLOR: Record<DecisionBucket, string> = {
  sell: "#ef4444",
  keep: "#22c55e",
  ship: "#3b82f6",
  donate: "#eab308",
};

const BUCKET_LABEL: Record<DecisionBucket, string> = {
  sell: "Sell",
  keep: "Keep",
  ship: "Ship",
  donate: "Donate",
};

const TOP_N = 5;

// ── Human-language band copy (derived from the numeric bands in the
//     backend service — kept in sync manually; bands shown are raw values). ──

function valueCopy(v: number): string {
  if (v >= 30) return "High resale value";
  if (v >= 22) return "Good resale value";
  if (v >= 14) return "Moderate resale value";
  if (v >= 8)  return "Low resale value";
  if (v >= 3)  return "Minimal resale value";
  return "No resale value on file";
}
function sizeCopy(v: number): string {
  if (v >= 20) return "Oversized / heavy";
  if (v >= 14) return "Bulky";
  if (v >= 6)  return "Mid-sized";
  if (v >= 1)  return "Compact";
  return "Negligible size";
}
function urgencyCopy(v: number): string {
  if (v >= 25) return "Move within 2 weeks";
  if (v >= 18) return "Move within a month";
  if (v >= 10) return "Move within 2 months";
  if (v >= 5)  return "Move within 3 months";
  return "Move date far off or not set";
}
function conditionCopy(v: number): string {
  if (v >= 15) return "Poor condition — better gone";
  if (v >= 8)  return "Fair condition";
  if (v >= 2)  return "Good condition";
  return "Excellent condition";
}
function sellBonusCopy(v: number): string {
  return v > 0 ? "Marked willing to sell" : "Not flagged for sale";
}

type BandKey = keyof ScoreBreakdown;
const BAND_ORDER: BandKey[] = ["value", "size", "urgency", "condition", "sellBonus"];
const BAND_LABEL: Record<BandKey, string> = {
  value: "Value",
  size: "Size",
  urgency: "Urgency",
  condition: "Condition",
  sellBonus: "Sell bonus",
};
const BAND_COPY: Record<BandKey, (n: number) => string> = {
  value: valueCopy,
  size: sizeCopy,
  urgency: urgencyCopy,
  condition: conditionCopy,
  sellBonus: sellBonusCopy,
};

function bandSum(b: ScoreBreakdown): number {
  return b.value + b.size + b.urgency + b.condition + b.sellBonus;
}

// ────────────────────────────────────────────────────────────────────────────

export interface PriorityPanelProps {
  projectId: string;
  onSelectRoom?: (roomId: string) => void;
  onItemChanged?: () => void;
}

export function PriorityPanel({ projectId, onSelectRoom, onItemChanged }: PriorityPanelProps) {
  const [loading, setLoading] = useState(true);
  const [priorities, setPriorities] = useState<PrioritizedItem[]>([]);
  const [itemsById, setItemsById] = useState<Record<string, Item>>({});
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [listingItem, setListingItem] = useState<Item | null>(null);

  // Selection mode (long-press → enter; tap → toggle; explicit Cancel → exit).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Phase 11: prompt for sold price when user taps "Mark as sold".
  const [soldPromptItem, setSoldPromptItem] = useState<Item | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getPrioritizedItems(projectId).catch(() => [] as PrioritizedItem[]),
      api.listItems({ projectId }).catch(() => [] as Item[]),
    ])
      .then(([pList, items]) => {
        if (cancelled) return;
        setPriorities(pList);
        setItemsById(Object.fromEntries(items.map((it) => [it.id, it])));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, refreshTick]);

  const applyAction = async (item: Item, action: ItemDecisionAction) => {
    try {
      await api.applyItemAction(item.id, action);
      setRefreshTick((t) => t + 1);
      onItemChanged?.();
    } catch (err) {
      console.error("[PriorityPanel] applyItemAction failed:", err);
    }
  };

  /** Intercept the "sold" action so we can prompt for a sell price first.
   *  Every other action flows straight through to applyAction. */
  const handleAction = async (item: Item, action: ItemDecisionAction) => {
    if (action === "sold") {
      setSoldPromptItem(item);
      return;
    }
    await applyAction(item, action);
  };

  const markSold = async (item: Item, soldPriceUsd?: number) => {
    try {
      await api.applyItemAction(
        item.id,
        "sold",
        soldPriceUsd !== undefined ? { soldPriceUsd } : {}
      );
      setRefreshTick((t) => t + 1);
      onItemChanged?.();
    } catch (err) {
      console.error("[PriorityPanel] sold action failed:", err);
    }
  };

  const enterSelectionWith = (itemId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([itemId]));
    setExpandedItemId(null);
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const applyBulk = async (action: ItemDecisionAction) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await api.applyBulkItemAction(Array.from(selectedIds), action);
      setRefreshTick((t) => t + 1);
      onItemChanged?.();
      exitSelection();
    } catch (err) {
      console.error("[PriorityPanel] applyBulkItemAction failed:", err);
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) return null;

  const rows = priorities
    .filter((p) => p.score > 0 && itemsById[p.itemId])
    .slice(0, TOP_N);

  if (rows.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
        padding: "16px",
        margin: "16px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
          🔥 Do This First
        </h3>
        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-secondary)" }}>
        {selectionMode
          ? "Tap items to select. Use the bar below to act on all of them."
          : "Tap an item to see how it was scored. Long-press to select multiple."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((p) => {
          const item = itemsById[p.itemId];
          const color = BUCKET_COLOR[p.recommendation];
          const expanded = expandedItemId === p.itemId;
          return (
            <PriorityRow
              key={p.itemId}
              item={item}
              priority={p}
              color={color}
              expanded={expanded && !selectionMode}
              selectionMode={selectionMode}
              selected={selectedIds.has(p.itemId)}
              onToggle={() => setExpandedItemId((cur) => (cur === p.itemId ? null : p.itemId))}
              onToggleSelect={() => toggleSelect(p.itemId)}
              onLongPress={() => enterSelectionWith(p.itemId)}
              onGoToRoom={onSelectRoom && item.roomId ? () => onSelectRoom(item.roomId) : undefined}
              onAction={(action) => handleAction(item, action)}
              onListForSale={() => setListingItem(item)}
            />
          );
        })}
      </div>

      {listingItem && (
        <ListingModal
          item={listingItem}
          onClose={() => setListingItem(null)}
          onListed={async (listingUrl?: string) => {
            if (!listingItem) return;
            const it = listingItem;
            setListingItem(null);
            await applyAction(it, "sell");
            if (listingUrl) {
              try { await api.updateItemListing(it.id, listingUrl); }
              catch (err) { console.warn("[PriorityPanel] updateItemListing failed:", err); }
              setRefreshTick((t) => t + 1);
            }
          }}
        />
      )}

      {selectionMode && (
        <BulkActionBar
          count={selectedIds.size}
          busy={bulkBusy}
          onCancel={exitSelection}
          onAction={applyBulk}
        />
      )}

      {soldPromptItem && (
        <SoldPriceSheet
          item={soldPromptItem}
          onClose={() => setSoldPromptItem(null)}
          onMarkSold={async (soldPriceUsd) => {
            const it = soldPromptItem;
            setSoldPromptItem(null);
            if (!it) return;
            await markSold(it, soldPriceUsd);
          }}
        />
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Sold-price sheet — optional price prompt on "Mark as sold"
// ────────────────────────────────────────────────────────────────────────────

function SoldPriceSheet({
  item, onClose, onMarkSold,
}: {
  item: Item;
  onClose: () => void;
  onMarkSold: (soldPriceUsd?: number) => Promise<void> | void;
}) {
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

function PriorityRow({
  item, priority, color, expanded,
  selectionMode, selected, onToggle, onToggleSelect, onLongPress,
  onGoToRoom, onAction, onListForSale,
}: {
  item: Item;
  priority: PrioritizedItem;
  color: string;
  expanded: boolean;
  selectionMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onToggleSelect: () => void;
  onLongPress: () => void;
  onGoToRoom?: () => void;
  onAction: (action: ItemDecisionAction) => void | Promise<void>;
  onListForSale: () => void;
}) {
  // Long-press / tap disambiguation.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number; firedLongPress: boolean } | null>(null);

  const clearPress = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    pressStart.current = { x: e.clientX, y: e.clientY, firedLongPress: false };
    clearPress();
    longPressTimer.current = setTimeout(() => {
      if (pressStart.current) pressStart.current.firedLongPress = true;
      longPressTimer.current = null;
      // Enter selection mode with this item (parent takes over from here).
      if (!selectionMode) onLongPress();
      else onToggleSelect();
    }, LONG_PRESS_MS);
  };
  const handlePointerMove: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    if (!pressStart.current || longPressTimer.current == null) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (dx * dx + dy * dy >= DRAG_CANCEL_PX * DRAG_CANCEL_PX) clearPress();
  };
  const handlePointerUp: React.PointerEventHandler<HTMLButtonElement> = () => {
    const long = pressStart.current?.firedLongPress === true;
    pressStart.current = null;
    clearPress();
    if (long) return; // long-press already did its thing
    if (selectionMode) onToggleSelect();
    else onToggle();
  };
  const handlePointerCancel = () => { pressStart.current = null; clearPress(); };

  const sum = bandSum(priority.breakdown);
  const multiplier = item.keepFlag ? 0.1 : item.sentimentalFlag ? 0.3 : 1;
  const multiplierNote = item.keepFlag
    ? "× 0.1 because marked as Keep"
    : item.sentimentalFlag
      ? "× 0.3 because Sentimental"
      : null;

  return (
    <div
      style={{
        border: `1px solid ${selected ? "var(--accent, #3b82f6)" : "var(--border-soft)"}`,
        borderRadius: 10,
        background: selected ? "rgba(59,130,246,0.08)" : "var(--bg-elevated, #f8fafc)",
        overflow: "hidden",
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        aria-expanded={!selectionMode && expanded}
        aria-pressed={selectionMode ? selected : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
          touchAction: "manipulation",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <span
          style={{
            width: 10, height: 10, borderRadius: "50%",
            background: color, flexShrink: 0, display: "inline-block",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.itemName}
            </span>
            <span
              style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em",
                background: color, color: "#fff",
                borderRadius: 4, padding: "2px 6px", flexShrink: 0,
              }}
            >
              {BUCKET_LABEL[priority.recommendation]}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {priority.reason}
          </div>
        </div>
        <span
          style={{
            fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
            background: "var(--bg-card, #fff)",
            border: "1px solid var(--border-soft)",
            borderRadius: 999, padding: "2px 8px", flexShrink: 0,
          }}
        >
          {priority.score}
        </span>
        {selectionMode ? (
          <span
            aria-hidden
            style={{
              width: 22, height: 22, borderRadius: 6,
              border: `2px solid ${selected ? "var(--accent, #3b82f6)" : "var(--border-soft)"}`,
              background: selected ? "var(--accent, #3b82f6)" : "transparent",
              color: "#fff", fontSize: 14, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {selected ? "✓" : ""}
          </span>
        ) : (
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
        )}
      </button>

      {expanded && (
        <div
          style={{
            padding: "12px 14px 14px",
            borderTop: "1px solid var(--border-soft)",
            background: "var(--bg-card, #fff)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>
            Why this recommendation?
          </div>

          {priority.calibration && (() => {
            const c = priority.calibration;
            const pct = Math.round(c.multiplier * 100);
            const cat = c.category.toLowerCase();
            const isLow = c.confidence === "low";
            const isMed = c.confidence === "medium";
            const dot = isLow ? "🔴" : isMed ? "🟡" : "🟢";
            const icon = isLow ? "⚠️" : "💡";
            const body = isLow
              ? `Based on limited data (${c.sampleSize} ${c.sampleSize === 1 ? "sale" : "sales"}), similar ${cat} items sell for ~${pct}% of estimate — this may vary.`
              : `Based on your past sales (${c.sampleSize}), similar ${cat} items sell for ~${pct}% of estimate.`;
            const bg  = isLow ? "rgba(234,179,8,0.10)"  : isMed ? "rgba(59,130,246,0.06)" : "rgba(34,197,94,0.08)";
            const brd = isLow ? "rgba(234,179,8,0.35)"  : isMed ? "rgba(59,130,246,0.18)" : "rgba(34,197,94,0.30)";
            return (
              <div style={{
                fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4,
                padding: "6px 10px", marginBottom: 8,
                background: bg, border: `1px solid ${brd}`, borderRadius: 6,
                display: "flex", alignItems: "flex-start", gap: 6,
              }}>
                <span aria-hidden style={{ fontSize: 10, lineHeight: "1.4" }}>{dot}</span>
                <div>{icon} {body}</div>
              </div>
            );
          })()}

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {BAND_ORDER.map((band) => {
              const n = priority.breakdown[band];
              return (
                <div
                  key={band}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 13, color: "var(--text-primary)",
                  }}
                >
                  <span style={{ minWidth: 80, fontWeight: 600, color: "var(--text-secondary)" }}>
                    {BAND_LABEL[band]}
                  </span>
                  <span
                    style={{
                      minWidth: 36, textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                      color: n > 0 ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {n > 0 ? `+${n}` : "0"}
                  </span>
                  <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                    {BAND_COPY[band](n)}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex", alignItems: "baseline", justifyContent: "space-between",
              paddingTop: 8, borderTop: "1px dashed var(--border-soft)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {multiplier !== 1 ? (
                <>
                  Raw total <strong style={{ color: "var(--text-primary)" }}>{sum}</strong>
                  <span> &nbsp;{multiplierNote}</span>
                </>
              ) : (
                <>Sum of bands</>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              Final: <span style={{ color: "var(--text-primary)" }}>{priority.score}</span>
            </div>
          </div>

          {item.status === "LISTED" ? (
            <>
              <div style={{
                fontSize: 11, color: "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.06em",
                marginTop: 12, marginBottom: 6,
              }}>
                You've listed this item
              </div>
              {item.listingUrl && (
                <div
                  style={{
                    fontSize: 11, color: "var(--text-secondary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    marginBottom: 6,
                  }}
                  title={item.listingUrl}
                >
                  🔗 {item.listingUrl}
                </div>
              )}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              }}>
                <ActionButton
                  label="Open listing"
                  tone="ship"
                  onClick={() => {
                    if (!item.listingUrl) return;
                    const url = /^https?:\/\//i.test(item.listingUrl) ? item.listingUrl : `https://${item.listingUrl}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  disabled={!item.listingUrl}
                />
                <ActionButton
                  label="Mark as sold"
                  tone="sell"
                  onClick={() => onAction("sold")}
                />
              </div>
            </>
          ) : (
            <div style={{
              marginTop: 12, display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}>
              <ActionButton label="List for sale"  tone="sell"   onClick={onListForSale} />
              <ActionButton label="Mark as donate" tone="donate" onClick={() => onAction("donate")} />
              <ActionButton label="Mark as ship"   tone="ship"   onClick={() => onAction("ship")} />
              <ActionButton label="Mark as keep"   tone="keep"   onClick={() => onAction("keep")} />
            </div>
          )}

          {onGoToRoom && (
            <button
              onClick={onGoToRoom}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border-soft)",
                borderRadius: 8,
                background: "var(--bg-elevated, #f8fafc)",
                cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Go to room →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Bulk action bar — sticky at the bottom of the panel while selection is on
// ────────────────────────────────────────────────────────────────────────────

function BulkActionBar({
  count, busy, onCancel, onAction,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onAction: (action: ItemDecisionAction) => void | Promise<void>;
}) {
  const countLabel = `${count} item${count === 1 ? "" : "s"} selected`;
  return (
    <div
      role="toolbar"
      aria-label="Bulk item actions"
      style={{
        position: "sticky", bottom: 0, left: 0, right: 0,
        marginTop: 14,
        background: "var(--bg-card, #fff)",
        border: "1px solid var(--border-soft)",
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.08)",
        display: "flex", flexDirection: "column", gap: 8,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{countLabel}</div>
        <button
          onClick={onCancel}
          style={{
            background: "none", border: "1px solid var(--border-soft)", borderRadius: 8,
            padding: "4px 12px", fontSize: 12, fontWeight: 600,
            color: "var(--text-secondary)", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {(["sell", "keep", "ship", "donate"] as DecisionBucket[]).map((a) => {
          const color = BUCKET_COLOR[a];
          return (
            <button
              key={a}
              onClick={() => onAction(a)}
              disabled={busy || count === 0}
              style={{
                padding: "10px 6px",
                border: `1px solid ${color}40`, borderRadius: 8,
                background: `${color}14`, color,
                fontSize: 12, fontWeight: 800, textAlign: "center",
                cursor: busy || count === 0 ? "default" : "pointer",
                opacity: busy || count === 0 ? 0.5 : 1,
                textTransform: "capitalize",
              }}
            >
              {busy ? "…" : a}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionButton({
  label, tone, onClick, disabled,
}: {
  label: string;
  tone: DecisionBucket;
  onClick: () => void;
  disabled?: boolean;
}) {
  const color = BUCKET_COLOR[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 12px",
        border: `1px solid ${color}40`,
        borderRadius: 8,
        background: `${color}14`,
        color,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontSize: 13, fontWeight: 700,
        textAlign: "center",
      }}
    >
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Listing modal — pre-fills title/price/description; copy-to-clipboard
// ────────────────────────────────────────────────────────────────────────────

function readableCondition(c: Item["condition"]): string {
  switch (c) {
    case "NEW":      return "new";
    case "LIKE_NEW": return "like-new";
    case "GOOD":     return "good";
    case "FAIR":     return "fair";
    case "POOR":     return "rough";
    default:         return "used";
  }
}

function defaultListing(item: Item): { title: string; price: string; description: string } {
  const title = item.identifiedName ?? item.itemName;
  const priceNum = item.priceFairMarket ?? item.priceFastSale ?? 0;
  const price = priceNum > 0 ? Math.round(priceNum).toString() : "";
  const priceLine = price ? ` Asking $${price}.` : "";
  const description = `Selling a ${title} in ${readableCondition(item.condition)} condition.${priceLine} Available for pickup.`;
  return { title, price, description };
}

function ListingModal({
  item, onClose, onListed,
}: {
  item: Item;
  onClose: () => void;
  onListed: (listingUrl?: string) => Promise<void> | void;
}) {
  const initial = defaultListing(item);
  const [title, setTitle] = useState(initial.title);
  const [price, setPrice] = useState(initial.price);
  const [description, setDescription] = useState(initial.description);
  const [listingUrl, setListingUrl] = useState(item.listingUrl ?? "");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const listingText = `${title}${price ? ` — $${price}` : ""}\n\n${description}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listingText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("[ListingModal] clipboard write failed:", err);
    }
  };

  const markListed = async () => {
    setBusy(true);
    try {
      const trimmed = listingUrl.trim();
      await onListed(trimmed.length > 0 ? trimmed : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10002,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "var(--bg-card, #fff)",
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          padding: "20px 16px 24px", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>List for sale</h3>
          <button onClick={onClose} aria-label="Close"
            style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer", color: "var(--text-secondary)" }}>×</button>
        </div>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 14 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Suggested price (USD)</div>
          <input
            value={price}
            inputMode="numeric"
            pattern="[0-9]*"
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 14 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 14, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
            Listing URL <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
          </div>
          <input
            value={listingUrl}
            onChange={(e) => setListingUrl(e.target.value)}
            inputMode="url"
            placeholder="Paste the URL after posting it"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border-soft)", borderRadius: 8, fontSize: 14 }}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={copy}
            style={{
              flex: 1, padding: "12px 14px",
              border: "1px solid var(--border-soft)", borderRadius: 8,
              background: "var(--bg-elevated, #f8fafc)",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            {copied ? "Copied ✓" : "Copy listing"}
          </button>
          <button
            onClick={markListed}
            disabled={busy}
            style={{
              flex: 1, padding: "12px 14px",
              border: "none", borderRadius: 8,
              background: BUCKET_COLOR.sell, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Marking…" : "Mark as listed"}
          </button>
        </div>

        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, marginBottom: 0 }}>
          Tip: Copy the text, then paste it into Facebook Marketplace, OfferUp, Craigslist, etc.
        </p>
      </div>
    </div>
  );
}
