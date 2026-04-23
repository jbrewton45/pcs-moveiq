import { useEffect, useRef, useState } from "react";
import type { Item, ItemCondition, SizeClass, Recommendation, Comparable, ComparableSource, ClarificationQuestion, RoomScan, ItemDecisionResult, DecisionBucket, ItemDecisionAction } from "../types";
import { isCompleted } from "../types";
import { api, getUploadUrl } from "../api";
import { CompletionStats } from "./CompletionStats";
import { VoiceCapture } from "./VoiceCapture";
import { BottomSheet } from "./ui/BottomSheet";
import { ConfirmSheet } from "./ui/ConfirmSheet";
import { RoomViewer } from "./RoomViewer";
import { FixItemPanel } from "./FixItemPanel";
import { formatItemDisplay } from "../utils/formatItemDisplay";
import { useToast } from "./ui/Toast";

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const CONDITIONS: ItemCondition[] = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"];
const SIZE_CLASSES: SizeClass[] = ["SMALL", "MEDIUM", "LARGE", "OVERSIZED"];

const BULK_ACTION_BUCKETS: DecisionBucket[] = ["sell", "keep", "ship", "donate"];
const BULK_ACTION_COLOR: Record<DecisionBucket, string> = {
  sell: "#ef4444",
  keep: "#22c55e",
  ship: "#3b82f6",
  donate: "#eab308",
};
const BULK_ACTION_LABEL: Record<DecisionBucket, string> = {
  sell: "Plan to Sell",
  keep: "Plan to Keep",
  ship: "Plan to Ship",
  donate: "Plan to Donate",
};

const PLAN_ACTION_VERB: Record<DecisionBucket, string> = {
  sell: "sell",
  keep: "keep",
  ship: "ship",
  donate: "donate",
};

const REC_BADGE_TEXT: Record<Recommendation, string> = {
  SELL_NOW: "Sell Now",
  SELL_SOON: "Sell Soon",
  SHIP: "Ship",
  STORE: "Store",
  DONATE: "Donate",
  DISCARD: "Discard",
  KEEP: "Keep",
  COMPLETE: "Sold",
};

const REC_BADGE_CLASS: Record<Recommendation, string> = {
  SELL_NOW: "rec-badge--sell-now",
  SELL_SOON: "rec-badge--sell-soon",
  SHIP: "rec-badge--ship",
  STORE: "rec-badge--store",
  DONATE: "rec-badge--donate",
  DISCARD: "rec-badge--discard",
  KEEP: "rec-badge--keep",
  COMPLETE: "rec-badge--store",
};

interface RecBadgeProps {
  recommendation: Recommendation;
}

function RecBadge({ recommendation }: RecBadgeProps) {
  return (
    <span className={`rec-badge ${REC_BADGE_CLASS[recommendation]}`}>
      {REC_BADGE_TEXT[recommendation]}
    </span>
  );
}

// ---------- ConfidenceDots ----------

function ConfidenceDots({ value }: { value: number }) {
  const filled = value >= 0.8 ? 5 : value >= 0.6 ? 4 : value >= 0.4 ? 3 : value >= 0.2 ? 2 : 1;
  return (
    <span className="confidence-dots" aria-label={`Confidence: ${Math.round(value * 100)}%`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`confidence-dot ${i <= filled ? "confidence-dot--filled" : "confidence-dot--empty"}`} />
      ))}
      {value < 0.4 && <span className="confidence-warning">Low confidence</span>}
    </span>
  );
}

// ---------- ProviderBadge ----------

function ProviderBadge({ reasoning, hasEbayComparables }: { reasoning?: string; hasEbayComparables?: boolean }) {
  if (!reasoning) return null;
  const isOpenAI = reasoning.startsWith("[OpenAI]");
  const isEbayOnly = reasoning.startsWith("Pricing derived from");
  let cls: string;
  let text: string;
  if (isEbayOnly) {
    cls = "provider-badge--ebay-enhanced";
    text = "eBay data";
  } else if (isOpenAI) {
    cls = "provider-badge--openai";
    text = hasEbayComparables ? "OpenAI + eBay data" : "OpenAI-powered";
  } else if (hasEbayComparables) {
    cls = "provider-badge--ebay-enhanced";
    text = "AI + eBay data";
  } else {
    cls = "provider-badge--live";
    text = "AI-powered";
  }
  return (
    <span className={`provider-badge ${cls}`}>{text}</span>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  claude: "Claude",
  openai: "OpenAI",
  ebay: "eBay",
  web: "Web",
  mock: "Mock",
};

function SourceSummary({ comparables }: { comparables: Comparable[] }) {
  const counts = new Map<ComparableSource, number>();
  for (const c of comparables) {
    counts.set(c.source, (counts.get(c.source) ?? 0) + 1);
  }
  if (counts.size < 2) return null;
  const parts: string[] = [];
  for (const src of ["ebay", "web", "claude", "openai"] as ComparableSource[]) {
    const n = counts.get(src);
    if (n) parts.push(`${n} from ${SOURCE_LABEL[src]}`);
  }
  return <p className="comp-list__source-summary">{parts.join(" · ")}</p>;
}

// ---------- cleanReasoning ----------

function cleanReasoning(reasoning?: string): string {
  if (!reasoning) return "";
  return reasoning.replace(/^\[(Mock|Fallback|OpenAI)\]\s*/, "").replace(/\s*\[Price adjusted:.*?\]/, "");
}

function isScannedItem(item: Item): boolean {
  return (
    item.identificationStatus !== "NONE" ||
    item.priceFairMarket != null ||
    !!item.pricingReasoning ||
    !!item.pendingClarifications
  );
}

function getPrimaryPhotoPath(item: Item): string | undefined {
  const primary = item.photos?.find((p) => p.isPrimary) ?? item.photos?.[0];
  return primary?.photoPath ?? item.photoPath;
}

// ---------- ConfigTierBadge ----------

const CONFIG_TIER_LABELS: Record<string, { label: string; cls: string }> = {
  "base": { label: "Base Unit", cls: "config-badge--base" },
  "base_plus": { label: "Base + Accessories", cls: "config-badge--base-plus" },
  "bundle": { label: "Bundle", cls: "config-badge--bundle" },
  "full_kit": { label: "Full Kit", cls: "config-badge--full-kit" },
};

function ConfigTierBadge({ reasoning }: { reasoning: string }) {
  const tierMatch = reasoning.match(/\b(base|base.?plus|bundle|full.?kit)\b/i);
  if (!tierMatch) return null;
  const tier = tierMatch[0].toLowerCase().replace(/\s+/g, "_").replace("-", "_");
  const info = CONFIG_TIER_LABELS[tier];
  if (!info) return null;
  return <span className={`config-badge ${info.cls}`}>{info.label}</span>;
}

// ---------- DecisionCard ----------

const ACTION_COLORS: Record<string, string> = {
  SELL_NOW: "#ef4444", SELL_LATER: "#f97316", SHIP: "#3b82f6",
  STORE: "#6b7280", DONATE: "#eab308", DISCARD: "#475569",
};
const ACTION_LABELS: Record<string, string> = {
  SELL_NOW: "Sell Now", SELL_LATER: "Sell Later", SHIP: "Ship",
  STORE: "Store", DONATE: "Donate", DISCARD: "Discard",
};
const CONF_DOTS: Record<string, string> = { HIGH: "🟢", MEDIUM: "🟡", LOW: "🔴" };

function DecisionCard({ decision, analysisStep }: {
  decision: ItemDecisionResult | null;
  analysisStep: string | null;
}) {
  if (analysisStep) {
    return (
      <div style={{
        background: "rgba(59,130,246,0.06)", border: "1px solid var(--accent-border, rgba(59,130,246,0.25))",
        borderRadius: 10, padding: "12px 14px", marginTop: 8,
      }}>
        <p style={{ fontSize: 13, color: "var(--accent-light, #3b82f6)", fontWeight: 600, margin: 0 }}>
          {analysisStep}
        </p>
      </div>
    );
  }
  if (!decision) return null;

  const actionColor = ACTION_COLORS[decision.recommendedAction] ?? "#6b7280";
  const urgencyPct = decision.urgencyScore;

  return (
    <div style={{
      background: "var(--bg-elevated, #f8fafc)", border: "1px solid var(--border-soft)",
      borderRadius: 10, padding: "12px 14px", marginTop: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{
          display: "inline-block", padding: "3px 10px", borderRadius: 6,
          background: actionColor, color: "#fff", fontSize: 12, fontWeight: 700,
        }}>
          {ACTION_LABELS[decision.recommendedAction] ?? decision.recommendedAction}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {CONF_DOTS[decision.confidenceLevel] ?? ""} {decision.confidenceLevel} confidence
        </span>
      </div>

      <div style={{ height: 6, borderRadius: 3, background: "rgba(148,163,184,0.15)", marginBottom: 8, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${urgencyPct}%`, borderRadius: 3,
          background: urgencyPct >= 60 ? "#ef4444" : urgencyPct >= 30 ? "#f97316" : "#22c55e",
          transition: "width 0.3s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
        <span>Urgency: {urgencyPct}/100</span>
        <span>Pricing confidence: {Math.round(decision.pricingConfidence * 100)}%</span>
      </div>

      <p style={{ fontSize: 13, color: "var(--text-primary)", margin: "0 0 6px", lineHeight: 1.4 }}>
        {decision.rationale}
      </p>

      {decision.recommendedPlatform && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
          Platform: <strong>{decision.recommendedPlatform}</strong>
        </p>
      )}
    </div>
  );
}

// ---------- MarkDonePopover ----------

interface MarkDonePopoverProps {
  item: Item;
  actioning: boolean;
  errorMsg: string | null;
  onMarkAction: (itemId: string, action: "sold" | "donated" | "discarded" | "shipped", soldPriceUsd?: number) => Promise<boolean>;
}

function MarkDonePopover({ item, actioning, errorMsg, onMarkAction }: MarkDonePopoverProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [showPriceInput, setShowPriceInput] = useState(false);
  const [soldPrice, setSoldPrice] = useState("");

  async function handleNonSoldAction(action: "donated" | "discarded" | "shipped") {
    const ok = await onMarkAction(item.id, action);
    if (ok) setShowOptions(false);
  }

  async function handleSoldConfirm() {
    const trimmed = soldPrice.trim();
    const parsed = parseFloat(trimmed);
    if (trimmed === "" || isNaN(parsed) || parsed < 0) return;
    const ok = await onMarkAction(item.id, "sold", parsed);
    if (ok) {
      setShowOptions(false);
      setShowPriceInput(false);
      setSoldPrice("");
    }
  }

  return (
    <div className="mark-done-popover">
      <button
        type="button"
        className="btn-mark-done"
        disabled={actioning}
        onClick={() => {
          setShowOptions((v) => !v);
          setShowPriceInput(false);
          setSoldPrice("");
        }}
      >
        Mark Done…
      </button>
      {showOptions && (
        <>
          {errorMsg && <p className="item-error-text">{errorMsg}</p>}
          {showPriceInput ? (
            <div className="mark-done-popover__price-row">
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="Sale price"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                disabled={actioning}
              />
              <button
                type="button"
                className="mark-done-popover__option"
                disabled={actioning || soldPrice.trim() === "" || parseFloat(soldPrice.trim()) < 0}
                onClick={() => void handleSoldConfirm()}
              >
                {actioning ? "..." : "Confirm"}
              </button>
              <button
                type="button"
                className="mark-done-popover__option"
                disabled={actioning}
                onClick={() => { setShowPriceInput(false); setSoldPrice(""); }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="mark-done-popover__grid">
              <button
                type="button"
                className="mark-done-popover__option"
                disabled={actioning}
                onClick={() => setShowPriceInput(true)}
              >
                Sold
              </button>
              <button
                type="button"
                className="mark-done-popover__option"
                disabled={actioning}
                onClick={() => void handleNonSoldAction("donated")}
              >
                {actioning ? "..." : "Donated"}
              </button>
              <button
                type="button"
                className="mark-done-popover__option"
                disabled={actioning}
                onClick={() => void handleNonSoldAction("shipped")}
              >
                {actioning ? "..." : "Shipped"}
              </button>
              <button
                type="button"
                className="mark-done-popover__option"
                disabled={actioning}
                onClick={() => void handleNonSoldAction("discarded")}
              >
                {actioning ? "..." : "Discarded"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- ItemReadCard ----------
interface ItemReadCardProps {
  item: Item;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onIdentify: (id: string) => void;
  onPricing: (id: string) => void;
  onConfirm: (id: string) => void;
  onItemUpdated?: (item: Item) => void;
  identifying: boolean;
  pricing: boolean;
  confirming: boolean;
  comparables: Comparable[];
  identifyError: boolean;
  identifyErrorMsg?: string;
  identifyWarning: boolean;
  pricingError: boolean;
  collapseSignal: number;
  expandSignal: number;
  onFullAnalysis: (id: string) => void;
  analyzing: boolean;
  analysisStep: string | null;
  decision: ItemDecisionResult | null;
  onCorrectAndReprice: (itemId: string, edits: {
    identifiedName: string;
    identifiedCategory: string;
    identifiedBrand: string | null;
    identifiedModel: string | null;
  }) => Promise<boolean>;
  correcting: boolean;
  correctError: string | null;
  onMarkAction: (itemId: string, action: "sold" | "donated" | "discarded" | "shipped", soldPriceUsd?: number) => Promise<boolean>;
  onPlanAction: (itemId: string, action: "sell" | "keep" | "ship" | "donate") => Promise<boolean>;
  actioning: boolean;
  actionError: string | null;
}

function ItemReadCard({
  item,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
  onIdentify: _onIdentify,
  onPricing,
  onConfirm: _onConfirm,
  onItemUpdated,
  identifying,
  pricing,
  confirming: _confirming,
  comparables,
  identifyError,
  identifyErrorMsg,
  identifyWarning,
  pricingError,
  collapseSignal,
  expandSignal,
  onFullAnalysis,
  analyzing,
  analysisStep,
  decision,
  onCorrectAndReprice,
  correcting,
  correctError,
  onMarkAction,
  onPlanAction,
  actioning,
  actionError,
}: ItemReadCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittingClarifications, setSubmittingClarifications] = useState(false);
  const quality = item.identificationQuality ?? "STRONG";
  const isWeak = quality === "WEAK";
  const isMedium = quality === "MEDIUM";
  const isItemCompleted_ = isCompleted(item);
  const itemDisplay = formatItemDisplay(item);
  const showModelPrompt =
    !isWeak &&
    !isItemCompleted_ &&
    !!item.requiresModelSelection &&
    (item.likelyModelOptions?.length ?? 0) >= 2;
  const scannedItem = isScannedItem(item);
  const [expanded, setExpanded] = useState(!scannedItem);
  const [showComparables, setShowComparables] = useState(false);

  useEffect(() => {
    setExpanded(!scannedItem);
    setShowComparables(false);
  }, [item.id, scannedItem]);

  useEffect(() => {
    if (collapseSignal > 0 && scannedItem) {
      setExpanded(false);
    }
  }, [collapseSignal, scannedItem]);

  useEffect(() => {
    if (expandSignal > 0 && scannedItem) {
      setExpanded(true);
    }
  }, [expandSignal, scannedItem]);

  let clarifications: ClarificationQuestion[] = [];
  if (item.pendingClarifications) {
    try {
      clarifications = JSON.parse(item.pendingClarifications) as ClarificationQuestion[];
    } catch {
      clarifications = [];
    }
  }

  const hasPricing = item.priceFairMarket != null || !!item.pricingReasoning;
  const hasAdvancedDetails =
    scannedItem ||
    !!item.notes ||
    item.sentimentalFlag ||
    item.keepFlag ||
    comparables.length > 0;

  const cardClass = [
    "item-card",
    selectMode ? "item-card--selectable" : "",
    selected ? "item-card--selected" : "",
    isItemCompleted_ ? "item-card--completed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={cardClass}>
      {selectMode && (
        <input
          type="checkbox"
          className="item-card__checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
        />
      )}
      <div className={selectMode ? "item-card__content" : undefined}>
        <div className="item-card__header">
          {getUploadUrl(getPrimaryPhotoPath(item)) && (
            <img
              className="item-card-thumb"
              src={getUploadUrl(getPrimaryPhotoPath(item)) ?? undefined}
              alt=""
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}
          <span
            className={`item-card__name${itemDisplay.isWeakName ? " item-card__name--weak" : ""}`}
          >
            {itemDisplay.displayName}
          </span>
          {!selectMode && (
            <button className="item-card__edit-btn" type="button" onClick={() => onEdit(item.id)}>
              Edit
            </button>
          )}
          {!isWeak && <RecBadge recommendation={item.recommendation} />}
          {isItemCompleted_ && (
            <span className={`completion-badge completion-badge--${item.status.toLowerCase()}`}>
              {item.status === "SOLD" && item.soldPriceUsd != null
                ? `Sold $${item.soldPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : item.status.charAt(0) + item.status.slice(1).toLowerCase()}
            </span>
          )}
        </div>
        {item.recommendationReason && (
          <p className="item-card__rec-reason">{item.recommendationReason}</p>
        )}
        <div className="item-card__meta">
          <span className={itemDisplay.isWeakCategory ? "item-card__meta--weak" : undefined}>
            {itemDisplay.displayCategory}
          </span>
          <span>|</span>
          <span>{label(item.condition)}</span>
          <span>|</span>
          <span>{label(item.sizeClass)}</span>
          {item.weightLbs != null && (
            <>
              <span>|</span>
              <span className="item-card__meta-weight">{item.weightLbs} lbs</span>
            </>
          )}
        </div>

        <div className="item-card__summary-row">
          <span className={`item-summary-chip item-summary-chip--${item.identificationStatus.toLowerCase()}`}>
            {item.identificationStatus === "NONE" ? "Needs ID" : item.identificationStatus === "SUGGESTED" ? "Review ID" : "Identified"}
          </span>
          {hasPricing && !showModelPrompt && (
            <span className="item-summary-chip item-summary-chip--pricing">
              {item.priceFairMarket != null ? `FMV $${item.priceFairMarket}` : "Pricing notes"}
            </span>
          )}
          {clarifications.length > 0 && (
            <span className="item-summary-chip item-summary-chip--clarification">
              {clarifications.length} question{clarifications.length > 1 ? "s" : ""}
            </span>
          )}
          {hasAdvancedDetails && (
            <button
              type="button"
              className="item-card__toggle-btn"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? "Hide Details" : "Show Details"}
            </button>
          )}
        </div>

        {expanded && (
          <>
            {item.notes && (
              <div className="item-card__notes">{item.notes}</div>
            )}
            {(item.sentimentalFlag || item.keepFlag) && (
              <div className="item-card__flags">
                {item.sentimentalFlag && (
                  <span className="item-card__flag item-card__flag--sentimental">
                    Sentimental
                  </span>
                )}
                {item.keepFlag && (
                  <span className="item-card__flag item-card__flag--keep">
                    Keep
                  </span>
                )}
              </div>
            )}

            {item.identificationStatus !== "NONE" && (
              <div className="item-card__identification">
                {/* Show identity info except when the WEAK panel is actively the sole surface (WEAK + SUGGESTED + active item) */}
                {(isItemCompleted_ || !isWeak || item.identificationStatus !== "SUGGESTED") && (
                  <>
                    <div className="id-header">
                      <span className={`id-status-badge id-status-badge--${item.identificationStatus.toLowerCase()}`}>
                        {item.identificationStatus === "SUGGESTED" ? "AI Suggested" : item.identificationStatus === "CONFIRMED" ? "Confirmed" : "Edited"}
                      </span>
                      <ConfidenceDots value={item.identificationConfidence ?? 0} />
                    </div>
                    <p className="id-details">
                      <strong>{item.identifiedName}</strong>
                      {item.identifiedBrand && <span> by {item.identifiedBrand}</span>}
                      {item.identifiedModel && <span> ({item.identifiedModel})</span>}
                    </p>
                    {item.identificationReasoning && <p className="id-reasoning">{cleanReasoning(item.identificationReasoning)}</p>}
                    <ProviderBadge reasoning={item.identificationReasoning} />
                  </>
                )}

                {/* Single unified correction surface — exactly one mode at a time */}
                {!isItemCompleted_ && isWeak && item.identificationStatus === "SUGGESTED" && (
                  <FixItemPanel
                    item={item}
                    mode="weak"
                    submitting={correcting}
                    errorMsg={correctError}
                    onSubmit={(edits) => onCorrectAndReprice(item.id, edits)}
                  />
                )}
                {!isItemCompleted_ && !isWeak && showModelPrompt && (
                  <FixItemPanel
                    item={item}
                    mode="model-pick"
                    modelOptions={item.likelyModelOptions ?? []}
                    submitting={correcting}
                    errorMsg={correctError}
                    onSubmit={(edits) => onCorrectAndReprice(item.id, edits)}
                  />
                )}
                {!isItemCompleted_ && !isWeak && !showModelPrompt && isMedium && item.identificationStatus === "SUGGESTED" && (
                  <FixItemPanel
                    item={item}
                    mode="medium"
                    submitting={correcting}
                    errorMsg={correctError}
                    onSubmit={(edits) => onCorrectAndReprice(item.id, edits)}
                  />
                )}
              </div>
            )}

            {!isItemCompleted_ && clarifications.length > 0 && (
              <div className="clarification-section">
                <h4 className="clarification-section__title">Quick Questions</h4>
                <p className="clarification-section__subtitle">These details could significantly affect pricing</p>
                {clarifications.map((q) => (
                  <div key={q.field} className="clarification-field">
                    <label className="clarification-field__label">{q.question}</label>
                    {q.inputType === "boolean" ? (
                      <div className="clarification-field__options">
                        <button
                          className={`clarification-option ${answers[q.field] === "yes" ? "clarification-option--selected" : ""}`}
                          onClick={() => setAnswers(a => ({ ...a, [q.field]: "yes" }))}
                        >Yes</button>
                        <button
                          className={`clarification-option ${answers[q.field] === "no" ? "clarification-option--selected" : ""}`}
                          onClick={() => setAnswers(a => ({ ...a, [q.field]: "no" }))}
                        >No</button>
                      </div>
                    ) : q.inputType === "select" && q.options ? (
                      <select
                        className="clarification-field__select"
                        value={answers[q.field] ?? ""}
                        onChange={(e) => setAnswers(a => ({ ...a, [q.field]: e.target.value }))}
                      >
                        <option value="">Select...</option>
                        {q.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="clarification-field__input"
                        type="text"
                        value={answers[q.field] ?? ""}
                        onChange={(e) => setAnswers(a => ({ ...a, [q.field]: e.target.value }))}
                        placeholder="Type your answer..."
                      />
                    )}
                  </div>
                ))}
                <button
                  className="clarification-submit"
                  disabled={submittingClarifications || Object.keys(answers).length === 0}
                  onClick={async () => {
                    setSubmittingClarifications(true);
                    try {
                      const updated = await api.submitClarifications(item.id, answers);
                      onItemUpdated?.(updated);
                      setAnswers({});
                      await onPricing(item.id);
                    } catch {
                      // show error silently
                    } finally {
                      setSubmittingClarifications(false);
                    }
                  }}
                >
                  {submittingClarifications ? "Submitting..." : "Submit & Refresh Pricing"}
                </button>
              </div>
            )}

            {!isWeak && !showModelPrompt && (item.priceFairMarket != null ? (
              <div className="item-card__pricing">
                <div className="pricing-bands">
                  <div className="pricing-band">
                    <span className="pricing-band__value">${item.priceFastSale}</span>
                    <span className="pricing-band__label">Fast Sale</span>
                  </div>
                  <div className="pricing-band">
                    <span className="pricing-band__value">${item.priceFairMarket}</span>
                    <span className="pricing-band__label">Fair Market</span>
                  </div>
                  <div className="pricing-band">
                    <span className="pricing-band__value">${item.priceReach}</span>
                    <span className="pricing-band__label">Reach</span>
                  </div>
                </div>
                <div className="pricing-meta">
                  {item.pricingSuggestedChannel && <span>Best: {item.pricingSuggestedChannel}</span>}
                  {item.pricingSaleSpeedBand && (
                    <span className={`pricing-speed pricing-speed--${item.pricingSaleSpeedBand.toLowerCase()}`}>
                      {label(item.pricingSaleSpeedBand)}
                    </span>
                  )}
                  <ConfidenceDots value={item.pricingConfidence ?? 0} />
                </div>
                {item.pricingReasoning && <p className="pricing-reasoning">{cleanReasoning(item.pricingReasoning)}</p>}
                {item.pricingReasoning && /\[(Priced from|Limited comparable)/.test(item.pricingReasoning) && (
                  <p className="pricing-config-note">
                    {item.pricingReasoning.match(/\[([^\]]+)\]/)?.[1]}
                  </p>
                )}
                <ProviderBadge reasoning={item.pricingReasoning} hasEbayComparables={comparables.some(c => c.source === "ebay")} />
                {item.pricingReasoning && /\b(base|base_plus|bundle|full.?kit)\b/i.test(item.pricingReasoning) && (
                  <ConfigTierBadge reasoning={item.pricingReasoning} />
                )}
              </div>
            ) : item.pricingReasoning ? (
              <div className="item-card__pricing item-card__pricing--no-estimate">
                <p className="pricing-no-estimate">No trustworthy estimate available</p>
                <p className="pricing-reasoning">{item.pricingReasoning}</p>
              </div>
            ) : null)}

            {comparables.length > 0 && !showModelPrompt && (
              <div className="comp-list">
                <button
                  type="button"
                  className="comp-list__toggle"
                  onClick={() => setShowComparables((v) => !v)}
                >
                  {showComparables ? "Hide Market Evidence" : "Show Market Evidence"} ({comparables.length})
                </button>
                {showComparables && (
                  <>
                    <p className="comp-list__title">Comparables</p>
                    <SourceSummary comparables={comparables} />
                    {comparables.map(c => (
                      <div key={c.id} className="comp-card">
                        {c.thumbnailUrl && (
                          <img className="comp-card__thumb" src={c.thumbnailUrl} alt="" loading="lazy" width={48} height={48} />
                        )}
                        <div className="comp-card__info">
                          {c.url ? (
                            <a className="comp-card__title comp-card__title-link" href={c.url} target="_blank" rel="noopener noreferrer">
                              {c.title}
                            </a>
                          ) : (
                            <span className="comp-card__title">{c.title}</span>
                          )}
                          <div className="comp-card__source-row">
                            <span className={`comp-source-badge comp-source-badge--${c.source}`}>
                              {SOURCE_LABEL[c.source]}
                            </span>
                          </div>
                        </div>
                        <div className="comp-card__right">
                          <span className="comp-card__price">${c.price}</span>
                          {c.soldStatus && (
                            <span className={`comp-card__status comp-card__status--${c.soldStatus.toLowerCase()}`}>
                              {c.soldStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {!selectMode && !isItemCompleted_ && (
          <div className="item-card__actions">
            {!isWeak && !showModelPrompt && !hasPricing && (
              <>
                {identifyError && <p className="item-error-text">{identifyErrorMsg || "Could not analyze this item."} <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => onFullAnalysis(item.id)}>Retry</span></p>}
                {identifyWarning && <p className="item-error-text" style={{ color: "var(--text-muted, #6b7280)" }}>AI provider unavailable — result is an estimate only. Add a photo and retry for better accuracy.</p>}
                {pricingError && <p className="item-error-text">Could not get pricing. Try again later.</p>}
                <button
                  className="btn-action-sm"
                  disabled={analyzing || identifying || pricing}
                  onClick={() => onFullAnalysis(item.id)}
                  style={{ marginTop: 4, background: "var(--accent, #3b82f6)", color: "#fff", border: "none" }}
                >
                  {analyzing ? (analysisStep ?? "Analyzing...") : "Analyze Item"}
                </button>
              </>
            )}
          </div>
        )}

        {!selectMode && !isItemCompleted_ && hasPricing && !isWeak && (
          <div className="item-card__plan-row" style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginTop: 12,
          }}>
            {(BULK_ACTION_BUCKETS as readonly DecisionBucket[]).map((a) => (
              <button
                key={a}
                type="button"
                className="item-card__plan-btn"
                disabled={actioning}
                onClick={() => void onPlanAction(item.id, a)}
                style={{
                  background: BULK_ACTION_COLOR[a],
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: actioning ? "not-allowed" : "pointer",
                  opacity: actioning ? 0.6 : 1,
                }}
              >
                {BULK_ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        )}

        {!selectMode && !isItemCompleted_ && hasPricing && (
          <MarkDonePopover
            item={item}
            actioning={actioning}
            errorMsg={actionError}
            onMarkAction={onMarkAction}
          />
        )}

        {hasPricing && !showModelPrompt && <DecisionCard decision={decision} analysisStep={analyzing ? analysisStep : null} />}
      </div>
    </div>
  );
}
// ---------- ItemEditForm ----------

interface ItemEditFormProps {
  item: Item;
  onSave: () => void;
  onRefresh: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function ItemEditForm({ item, onSave, onRefresh, onCancel, onDelete }: ItemEditFormProps) {
  const [itemName, setItemName] = useState(item.itemName);
  const [category, setCategory] = useState(item.category);
  const [condition, setCondition] = useState<ItemCondition>(item.condition);
  const [sizeClass, setSizeClass] = useState<SizeClass>(item.sizeClass);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [weightLbs, setWeightLbs] = useState(item.weightLbs?.toString() ?? "");
  const [sentimentalFlag, setSentimentalFlag] = useState(item.sentimentalFlag);
  const [keepFlag, setKeepFlag] = useState(item.keepFlag);
  const [willingToSell, setWillingToSell] = useState(item.willingToSell);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoActionInFlightId, setPhotoActionInFlightId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await api.updateItem(item.id, {
        itemName,
        category,
        condition,
        sizeClass,
        notes: notes || undefined,
        weightLbs: weightLbs.trim() ? parseFloat(weightLbs) : undefined,
        sentimentalFlag,
        keepFlag,
        willingToSell,
      });
      onSave();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    onDelete();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setPhotoError("");
    try {
      await api.addItemPhoto(item.id, file);
      onRefresh();
    } catch {
      setPhotoError("Upload failed. Try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto(photoId?: string) {
    setUploading(true);
    setPhotoError("");
    try {
      if (photoId) {
        await api.deleteItemPhotoById(item.id, photoId);
      } else {
        await api.deleteItemPhoto(item.id);
      }
      onRefresh();
    } catch {
      setPhotoError("Failed to remove photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSetPrimary(photoId: string) {
    setPhotoActionInFlightId(photoId);
    setPhotoError("");
    try {
      await api.setItemPrimaryPhoto(item.id, photoId);
      onRefresh();
    } catch {
      setPhotoError("Failed to set primary photo.");
    } finally {
      setPhotoActionInFlightId(null);
    }
  }

  const photos = item.photos ?? (item.photoPath ? [{ id: "legacy", itemId: item.id, photoPath: item.photoPath, isPrimary: true, createdAt: item.createdAt }] : []);
  const primaryPhotoPath = getPrimaryPhotoPath(item);

  return (
    <div className="item-card item-card--editing">
      <form className="item-edit-form" onSubmit={handleSave}>
        <div className="item-edit-photo-section">
          {primaryPhotoPath ? (
            <>
              <img
                className="item-edit-photo-preview"
                src={getUploadUrl(primaryPhotoPath) ?? undefined}
                alt=""
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <div className="item-edit-photo-actions item-edit-photo-actions--stacked">
                <button type="button" className="btn-photo-replace" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? "Uploading..." : "Add Photo"}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn-photo-replace" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? "Uploading..." : "Add Photo"}
            </button>
          )}
          {photos.length > 0 && (
            <div className="item-photo-gallery" role="list">
              {photos.map((photo) => (
                <div key={photo.id} className={`item-photo-gallery__item ${photo.isPrimary ? "item-photo-gallery__item--primary" : ""}`} role="listitem">
                  <img
                    className="item-photo-gallery__thumb"
                    src={getUploadUrl(photo.photoPath) ?? undefined}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <div className="item-photo-gallery__actions">
                    <button
                      type="button"
                      className="btn-photo-replace"
                      disabled={uploading || photoActionInFlightId === photo.id || photo.isPrimary}
                      onClick={() => void handleSetPrimary(photo.id)}
                    >
                      {photo.isPrimary ? "Primary" : photoActionInFlightId === photo.id ? "Saving..." : "Set Primary"}
                    </button>
                    <button
                      type="button"
                      className="btn-photo-remove"
                      disabled={uploading || photoActionInFlightId === photo.id}
                      onClick={() => void handleRemovePhoto(photo.id === "legacy" ? undefined : photo.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handleFileSelect}
          />
          <p className="item-edit-photo-hint">Max 10 MB. JPEG, PNG, or WebP.</p>
          {photoError && <p className="form-error">{photoError}</p>}
        </div>

        <label>
          Item Name
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
          />
        </label>

        <label>
          Category
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />
        </label>

        <label>
          Condition
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as ItemCondition)}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Size
          <select
            value={sizeClass}
            onChange={(e) => setSizeClass(e.target.value as SizeClass)}
          >
            {SIZE_CLASSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Est. Weight (lbs)
          <div className="weight-input-group">
            <input
              className="weight-input-group__input"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              placeholder="0"
              value={weightLbs}
              onChange={e => setWeightLbs(e.target.value)}
            />
            <span className="weight-input-group__suffix">lbs</span>
          </div>
        </label>

        <label>
          Notes (optional)
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any context, measurements, or reminders..."
          />
        </label>

        <div className="checkbox-row">
          <input
            id={`edit-sentimental-${item.id}`}
            type="checkbox"
            checked={sentimentalFlag}
            onChange={(e) => setSentimentalFlag(e.target.checked)}
          />
          <label htmlFor={`edit-sentimental-${item.id}`} style={{ marginBottom: 0 }}>
            Sentimental
          </label>
        </div>

        <div className="checkbox-row">
          <input
            id={`edit-keep-${item.id}`}
            type="checkbox"
            checked={keepFlag}
            onChange={(e) => setKeepFlag(e.target.checked)}
          />
          <label htmlFor={`edit-keep-${item.id}`} style={{ marginBottom: 0 }}>
            Keep (not for sale/donation)
          </label>
        </div>

        <div className="checkbox-row">
          <input
            id={`edit-willingtosell-${item.id}`}
            type="checkbox"
            checked={willingToSell}
            onChange={(e) => setWillingToSell(e.target.checked)}
          />
          <label htmlFor={`edit-willingtosell-${item.id}`} style={{ marginBottom: 0 }}>
            Willing to Sell
          </label>
        </div>

        {formError && <p className="form-error">{formError}</p>}

        <div className="item-edit-actions">
          <button className="btn-cancel" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-save" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="item-edit-delete-zone">
          <button
            className="item-delete-btn"
            type="button"
            onClick={handleDelete}
          >
            Delete this item
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Main component ----------

interface Props {
  roomId: string;
  projectId: string;
  roomName: string;
  roomType: string;
  onBack: () => void;
}

export function RoomDetailView({
  roomId,
  projectId,
  roomName,
  roomType,
  onBack,
}: Props) {
  const { showToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [comparables, setComparables] = useState<Record<string, Comparable[]>>({});
  const [identifying, setIdentifying] = useState<string | null>(null);
  const [pricing, setPricing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [identifyErrorMsg, setIdentifyErrorMsg] = useState<string | null>(null);
  const [identifyWarning, setIdentifyWarning] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Full analysis state (per-item)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ItemDecisionResult>>({});
  const [pcsDate, setPcsDate] = useState<string | null>(null);

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Intake flow state
  const [showIntakeSheet, setShowIntakeSheet] = useState(false);
  const [showAddItemOptions, setShowAddItemOptions] = useState(false);
  const [intakeMode, setIntakeMode] = useState<"manual" | "voice" | "walkthrough">("manual");
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [quickAddError, setQuickAddError] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [collapseScannedSignal, setCollapseScannedSignal] = useState(0);
  const [expandScannedSignal, setExpandScannedSignal] = useState(0);

  // Batch identify/price state
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchResults, setBatchResults] = useState<Array<{
    itemId: string;
    status: "queued" | "complete" | "no_estimate" | "error";
  }> | null>(null);

  // Add item form state
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState<ItemCondition>("GOOD");
  const [sizeClass, setSizeClass] = useState<SizeClass>("MEDIUM");
  const [notes, setNotes] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [sentimentalFlag, setSentimentalFlag] = useState(false);
  const [keepFlag, setKeepFlag] = useState(false);
  const [willingToSell, setWillingToSell] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [showBulkSheet, setShowBulkSheet] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<Item | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .listItems({ roomId })
      .then(async (fetchedItems) => {
        setItems(fetchedItems);
        const pricedItems = fetchedItems.filter(i => i.priceFairMarket != null && !isCompleted(i));
        const compEntries = await Promise.all(
          pricedItems.map(async i => [i.id, await api.getComparables(i.id).catch(() => [])] as const)
        );
        setComparables(Object.fromEntries(compEntries));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [roomId, refreshKey]);

  // Room scan (Phase 3 — visualization)
  const [roomScan, setRoomScan] = useState<RoomScan | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.getRoomScan(roomId)
      .then(scan => { if (!cancelled) setRoomScan(scan); })
      .catch(() => { if (!cancelled) setRoomScan(null); });
    return () => { cancelled = true; };
  }, [roomId, refreshKey]);

  // Priority scores for every item in this project (Phase 6) — drives the
  // amber halo on high-priority markers in the RoomViewer.
  const [priorityByItemId, setPriorityByItemId] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    api.getPrioritizedItems(projectId)
      .then(list => {
        if (!cancelled) setPriorityByItemId(Object.fromEntries(list.map(p => [p.itemId, p.score])));
      })
      .catch(() => { if (!cancelled) setPriorityByItemId({}); });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      await api.createItem({
        projectId,
        roomId,
        itemName,
        category,
        condition,
        sizeClass,
        notes: notes || undefined,
        ...(weightLbs.trim() ? { weightLbs: parseFloat(weightLbs) } : {}),
        sentimentalFlag,
        keepFlag,
        willingToSell,
      });
      setItemName("");
      setCategory("");
      setCondition("GOOD");
      setSizeClass("MEDIUM");
      setNotes("");
      setWeightLbs("");
      setSentimentalFlag(false);
      setKeepFlag(false);
      setWillingToSell(false);
      setShowIntakeSheet(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  }

  // Fetch PCS date for decision engine
  useEffect(() => {
    let cancelled = false;
    api.getProject(projectId)
      .then(p => { if (!cancelled) setPcsDate(p.hardMoveDate ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  async function handleFullAnalysis(itemId: string) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    setAnalyzingId(itemId);
    setAnalysisStep("Analyzing item...");

    try {
      // Step 1: Identify (if needed)
      let identified = item;
      if (item.identificationStatus === "NONE") {
        setAnalysisStep("Identifying item...");
        identified = await api.identifyItem(itemId);
        setRefreshKey(k => k + 1);
      }

      // Step 2: Get pricing (if needed)
      if (identified.priceFairMarket == null) {
        setAnalysisStep("Getting AI pricing...");
        const pricingResult = await api.getItemPricing(itemId);
        setComparables(prev => ({ ...prev, [itemId]: pricingResult.comparables }));
        identified = pricingResult.item;
        setRefreshKey(k => k + 1);
      }

      // Step 3: Fetch eBay sold data
      setAnalysisStep("Fetching market data...");
      let ebayData: { avgPrice?: number; medianPrice?: number; lowPrice?: number; highPrice?: number; listingCount?: number } = {};
      try {
        const searchQuery = identified.identifiedName ?? identified.itemName;
        const sold = await api.getEbaySoldListings(searchQuery, identified.condition);
        if (sold.sampleListings.length > 0) {
          ebayData = {
            avgPrice: sold.avgPrice,
            medianPrice: sold.medianPrice,
            lowPrice: sold.lowPrice,
            highPrice: sold.highPrice,
            listingCount: sold.totalFound,
          };
        }
      } catch {
        // eBay unavailable — continue without it
      }

      // Step 4: Call decision engine
      setAnalysisStep("Calculating recommendation...");
      const decision = await api.getItemDecision({
        itemName: identified.identifiedName ?? identified.itemName,
        category: identified.identifiedCategory ?? identified.category,
        condition: identified.condition,
        sizeClass: identified.sizeClass,
        weightLbs: identified.weightLbs,
        priceFairMarket: identified.priceFairMarket,
        priceFastSale: identified.priceFastSale,
        ebayAvgPrice: ebayData.avgPrice,
        ebayMedianPrice: ebayData.medianPrice,
        ebayLowPrice: ebayData.lowPrice,
        ebayHighPrice: ebayData.highPrice,
        ebayListingCount: ebayData.listingCount,
        pcsDate: pcsDate ?? undefined,
        keepFlag: identified.keepFlag,
        sentimentalFlag: identified.sentimentalFlag,
        willingToSell: identified.willingToSell,
      });

      setDecisions(prev => ({ ...prev, [itemId]: decision }));
    } catch (err) {
      console.error("[analysis] failed:", err instanceof Error ? err.message : err);
    } finally {
      setAnalyzingId(null);
      setAnalysisStep(null);
    }
  }

  function handleEditSave() {
    setRefreshKey((k) => k + 1);
    setEditingItemId(null);
  }

  function handleEditRefresh() {
    setRefreshKey((k) => k + 1);
  }

  function handleEditDelete() {
    setRefreshKey((k) => k + 1);
    setEditingItemId(null);
    setConfirmDeleteItem(null);
  }

  async function handleConfirmedItemDelete() {
    if (!confirmDeleteItem) return;
    try {
      await api.deleteItem(confirmDeleteItem.id);
      handleEditDelete();
    } catch {
      // item form shows authoritative errors while editing;
      // this path keeps state stable even if delete fails.
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  async function handleBulkAction(action: ItemDecisionAction) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      await api.applyBulkItemAction(Array.from(selectedIds), action);
      setSelectedIds(new Set());
      setSelectMode(false);
      setShowBulkSheet(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    await api.bulkDeleteItems(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowBulkSheet(false);
    setConfirmBulkDelete(false);
    setRefreshKey((k) => k + 1);
  }

  async function handleIdentify(itemId: string) {
    setIdentifying(itemId);
    setIdentifyError(null);
    setIdentifyWarning(null);
    try {
      const identified = await api.identifyItem(itemId);
      setRefreshKey(k => k + 1);
      if (identified.identificationReasoning?.startsWith("[Mock]") || identified.identificationReasoning?.startsWith("[Fallback]")) {
        setIdentifyWarning(itemId);
      }
    } catch (err) {
      setIdentifyError(itemId);
      setIdentifyErrorMsg(err instanceof Error ? err.message : "Identification failed");
    } finally {
      setIdentifying(null);
    }
  }

  async function handlePricing(itemId: string) {
    setPricing(itemId);
    setPricingError(null);
    try {
      const result = await api.getItemPricing(itemId);
      setComparables(prev => ({ ...prev, [itemId]: result.comparables }));
      setRefreshKey(k => k + 1);
    } catch {
      setPricingError(itemId);
    } finally {
      setPricing(null);
    }
  }

  async function handleConfirm(itemId: string) {
    setConfirming(true);
    try {
      await api.confirmIdentification(itemId);
      setRefreshKey(k => k + 1);
    } catch { /* silent */ }
    finally { setConfirming(false); }
  }

  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctErrorByItem, setCorrectErrorByItem] = useState<Record<string, string>>({});

  async function handleCorrectAndReprice(
    itemId: string,
    edits: {
      identifiedName: string;
      identifiedCategory: string;
      identifiedBrand: string | null;
      identifiedModel: string | null;
    },
  ): Promise<boolean> {
    setCorrectingId(itemId);
    setCorrectErrorByItem(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    try {
      const result = await api.correctAndReprice(itemId, edits);
      setItems(prev => prev.map(i => (i.id === itemId ? result.item : i)));
      setComparables(prev => ({ ...prev, [itemId]: result.comparables }));
      showToast("Saved — re-pricing with your details");
      return true;
    } catch (err) {
      setCorrectErrorByItem(prev => ({
        ...prev,
        [itemId]: err instanceof Error ? err.message : "Correction failed",
      }));
      showToast("Save failed — try again", "error");
      return false;
    } finally {
      setCorrectingId(null);
    }
  }

  async function handlePlanAction(
    itemId: string,
    action: "sell" | "keep" | "ship" | "donate",
  ): Promise<boolean> {
    setActionBusyId(itemId);
    setActionErrorByItem(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    try {
      const updated = await api.applyItemAction(itemId, action);
      setItems(prev => prev.map(i => (i.id === itemId ? updated : i)));
      showToast(`Planned to ${PLAN_ACTION_VERB[action]}`);
      return true;
    } catch (err) {
      setActionErrorByItem(prev => ({
        ...prev,
        [itemId]: err instanceof Error ? err.message : "Action failed",
      }));
      showToast("Couldn't save that plan — try again", "error");
      return false;
    } finally {
      setActionBusyId(null);
    }
  }

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionErrorByItem, setActionErrorByItem] = useState<Record<string, string>>({});

  async function handleMarkAction(
    itemId: string,
    action: "sold" | "donated" | "discarded" | "shipped",
    soldPriceUsd?: number,
  ): Promise<boolean> {
    setActionBusyId(itemId);
    setActionErrorByItem(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    try {
      const updated = await api.applyItemAction(itemId, action, soldPriceUsd !== undefined ? { soldPriceUsd } : {});
      setItems(prev => prev.map(i => (i.id === itemId ? updated : i)));
      const verb =
        action === "sold" ? "sold"
        : action === "donated" ? "donated"
        : action === "shipped" ? "shipped"
        : "discarded";
      showToast(`Marked ${verb}`);
      return true;
    } catch (err) {
      setActionErrorByItem(prev => ({
        ...prev,
        [itemId]: err instanceof Error ? err.message : "Action failed",
      }));
      showToast("Action failed — try again", "error");
      return false;
    } finally {
      setActionBusyId(null);
    }
  }

  function handleItemUpdated(updated: Item) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
  }

  async function handleWalkthroughComplete(itemIds: string[]) {
    if (itemIds.length === 0) return;
    setShowIntakeSheet(false);
    setRefreshKey(k => k + 1);

    // Initialize batch status
    setBatchResults(itemIds.map(id => ({ itemId: id, status: "queued" as const })));
    setBatchProcessing(true);

    try {
      const response = await api.batchIdentifyPrice(itemIds);
      setBatchResults(response.results.map(r => ({
        itemId: r.itemId,
        status: r.status,
      })));
      setRefreshKey(k => k + 1); // refresh items to show new pricing
    } catch {
      setBatchResults(itemIds.map(id => ({ itemId: id, status: "error" as const })));
    } finally {
      setBatchProcessing(false);
    }
  }

  const editedItem = editingItemId ? items.find((i) => i.id === editingItemId) ?? null : null;
  const roomWeight = items.reduce((sum, i) => sum + (i.weightLbs ?? 0), 0);
  const scannedItemCount = items.filter(isScannedItem).length;
  const remainingItemCount = items.filter(i => !isCompleted(i)).length;

  function openIntake(mode: "manual" | "voice" | "walkthrough") {
    setIntakeMode(mode);
    setShowIntakeSheet(true);
  }

  async function handlePhotoDrivenAdd(file: File) {
    setQuickAddBusy(true);
    setQuickAddError("");
    try {
      const created = await api.createItem({
        projectId,
        roomId,
        itemName: "Scanned Item",
        category: "Uncategorized",
        condition: "GOOD",
        sizeClass: "SMALL",
        notes: undefined,
        sentimentalFlag: false,
        keepFlag: false,
        willingToSell: true,
      });

      await api.uploadItemPhoto(created.id, file);
      await api.identifyItem(created.id);
      const result = await api.getItemPricing(created.id);
      setComparables(prev => ({ ...prev, [created.id]: result.comparables }));
      setShowAddItemOptions(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setQuickAddError(err instanceof Error ? err.message : "Could not process image. Try again.");
    } finally {
      setQuickAddBusy(false);
    }
  }

  async function handleCameraSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handlePhotoDrivenAdd(file);
    e.target.value = "";
  }

  async function handleGallerySelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handlePhotoDrivenAdd(file);
    e.target.value = "";
  }

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        Back to Project
      </button>

      <div className="detail-header">
        <div className="detail-title-block">
          <h2 className="detail-name">{roomName}</h2>
          <p className="detail-route">{roomType}</p>
          {roomWeight > 0 && <p className="room-weight-total">Est. weight: {roomWeight} lbs</p>}
        </div>
      </div>

      <CompletionStats items={items} />

      <section style={{ marginBottom: "var(--space-4)" }}>
        <h3 className="section-heading" style={{ marginBottom: "var(--space-3)" }}>Room Layout</h3>
        {roomScan ? (
          <RoomViewer
            scan={roomScan}
            items={items}
            onPlacementChanged={() => setRefreshKey(k => k + 1)}
            priorityByItemId={priorityByItemId}
          />
        ) : (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border-soft)",
            borderRadius: "var(--radius-md)", padding: "24px 16px", textAlign: "center",
          }}>
            <p style={{ fontSize: 28, margin: "0 0 8px" }}>📐</p>
            <p style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)", margin: "0 0 6px" }}>
              No room scan yet
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.4 }}>
              Use the LiDAR scanner to capture this room's layout. You'll be able to see walls, doors, furniture, and place your inventory items on the floor plan.
            </p>
            <a
              href="/floorplan"
              style={{
                display: "inline-block", padding: "10px 20px", border: "none", borderRadius: 8,
                background: "var(--accent, #3b82f6)", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none",
              }}
            >
              Go to Floorplan Scanner
            </a>
          </div>
        )}
      </section>

      <section>
        <div className="section-heading-row">
          <h3 className="section-heading">Inventory</h3>
          <div className="section-heading-row__actions section-heading-row__actions--inventory">
            <button className="sheet__btn sheet__btn--primary room-add-primary" type="button" onClick={() => setShowAddItemOptions(true)}>
              Add Item
            </button>
            <button className="voice-capture-btn" type="button" onClick={() => openIntake("voice")}>
              Voice
            </button>
            <button className="voice-capture-btn" type="button" onClick={() => openIntake("walkthrough")}>
              Walkthrough
            </button>
          </div>
        </div>

        <div className="inventory-toolbar">
          <p className="inventory-toolbar__summary">
            {remainingItemCount} of {items.length} item{items.length === 1 ? "" : "s"} | {scannedItemCount} scanned
          </p>
          {scannedItemCount > 0 && (
            <div className="inventory-toolbar__actions">
              <button
                className="bulk-select-all-btn"
                type="button"
                onClick={() => setExpandScannedSignal((v) => v + 1)}
              >
                Expand Scanned
              </button>
              <button
                className="bulk-select-all-btn"
                type="button"
                onClick={() => setCollapseScannedSignal((v) => v + 1)}
              >
                Collapse Scanned
              </button>
            </div>
          )}
          {items.length > 0 && !selectMode && (
            <button
              className="bulk-select-btn"
              onClick={() => {
                setEditingItemId(null);
                setSelectMode(true);
              }}
            >
              Select
            </button>
          )}
          {selectMode && (
            <div className="bulk-controls">
              <button className="bulk-select-all-btn" onClick={toggleSelectAll}>
                {selectedIds.size === items.length ? "Deselect All" : "Select All"}
              </button>
              {selectedIds.size > 0 && (
                <button className="bulk-select-all-btn" onClick={() => setShowBulkSheet(true)}>
                  Actions ({selectedIds.size})
                </button>
              )}
              <button
                className="bulk-cancel-btn"
                onClick={() => {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                  setShowBulkSheet(false);
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {batchResults && (
          <div className="batch-status">
            <div className="batch-status__header">
              <h4 className="batch-status__title">
                {batchProcessing ? "Identifying and Pricing Items..." : "Batch Processing Complete"}
              </h4>
              {!batchProcessing && (
                <button className="btn-cancel" type="button" onClick={() => setBatchResults(null)}>
                  Dismiss
                </button>
              )}
            </div>
            <div className="batch-status__items">
              {batchResults.map((r, i) => (
                <div key={r.itemId} className={`batch-status__item batch-status__item--${r.status}`}>
                  <span className="batch-status__item-num">#{i + 1}</span>
                  <span className="batch-status__item-status">
                    {r.status === "queued" ? "Queued..." :
                     r.status === "complete" ? "Done" :
                     r.status === "no_estimate" ? "No estimate" :
                     "Error"}
                  </span>
                </div>
              ))}
            </div>
            {batchProcessing && (
              <div className="batch-status__progress">
                <div className="batch-status__bar">
                  <div
                    className="batch-status__bar-fill"
                    style={{ width: `${(batchResults.filter(r => r.status !== "queued").length / batchResults.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="loading">Loading items...</p>
        ) : items.length === 0 ? (
          <p className="empty">No items yet. Use Add Item to start this room inventory.</p>
        ) : (
          <div className="item-list">
            {items.map((item) => (
              <ItemReadCard
                key={item.id}
                item={item}
                selectMode={selectMode}
                selected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
                onEdit={setEditingItemId}
                onIdentify={handleIdentify}
                onPricing={handlePricing}
                onConfirm={handleConfirm}
                onItemUpdated={handleItemUpdated}
                identifying={identifying === item.id}
                pricing={pricing === item.id}
                confirming={confirming}
                comparables={comparables[item.id] ?? []}
                identifyError={identifyError === item.id}
                identifyErrorMsg={identifyError === item.id ? (identifyErrorMsg ?? undefined) : undefined}
                identifyWarning={identifyWarning === item.id}
                pricingError={pricingError === item.id}
                collapseSignal={collapseScannedSignal}
                expandSignal={expandScannedSignal}
                onFullAnalysis={handleFullAnalysis}
                analyzing={analyzingId === item.id}
                analysisStep={analyzingId === item.id ? analysisStep : null}
                decision={decisions[item.id] ?? null}
                onCorrectAndReprice={handleCorrectAndReprice}
                correcting={correctingId === item.id}
                correctError={correctErrorByItem[item.id] ?? null}
                onMarkAction={handleMarkAction}
                onPlanAction={handlePlanAction}
                actioning={actionBusyId === item.id}
                actionError={actionErrorByItem[item.id] ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <BottomSheet
        open={showAddItemOptions}
        onClose={() => {
          if (!quickAddBusy) setShowAddItemOptions(false);
        }}
        title="Add Item"
      >
        <div className="add-item-sheet">
          <button
            type="button"
            className="sheet__btn sheet__btn--primary add-item-sheet__option"
            disabled={quickAddBusy}
            onClick={() => cameraInputRef.current?.click()}
          >
            {quickAddBusy ? "Processing..." : "Take Photo"}
          </button>
          <button
            type="button"
            className="sheet__btn sheet__btn--secondary add-item-sheet__option"
            disabled={quickAddBusy}
            onClick={() => galleryInputRef.current?.click()}
          >
            Choose from Gallery
          </button>
          <button
            type="button"
            className="add-item-sheet__manual-link"
            disabled={quickAddBusy}
            onClick={() => {
              setShowAddItemOptions(false);
              openIntake("manual");
            }}
          >
            Manual Entry
          </button>
          {quickAddError && <p className="form-error">{quickAddError}</p>}
          <p className="add-item-sheet__hint">Photo flow runs identification, pricing, and recommendations automatically.</p>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void handleCameraSelect(e)}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void handleGallerySelect(e)}
          />
        </div>
      </BottomSheet>

      <BottomSheet
        open={showIntakeSheet}
        onClose={() => setShowIntakeSheet(false)}
        title={intakeMode === "manual" ? "Add Item" : intakeMode === "voice" ? "Voice Capture" : "Room Walkthrough"}
      >
        {intakeMode === "walkthrough" ? (
          <VoiceCapture
            projectId={projectId}
            roomId={roomId}
            roomType={roomType}
            walkthrough
            onItemCreated={() => setRefreshKey((k) => k + 1)}
            onCancel={() => setShowIntakeSheet(false)}
            onWalkthroughComplete={handleWalkthroughComplete}
          />
        ) : intakeMode === "voice" ? (
          <VoiceCapture
            projectId={projectId}
            roomId={roomId}
            roomType={roomType}
            onItemCreated={() => {
              setRefreshKey((k) => k + 1);
              setShowIntakeSheet(false);
            }}
            onCancel={() => setShowIntakeSheet(false)}
          />
        ) : (
          <form className="project-form" onSubmit={handleAddItem}>
            {formError && <p className="form-error">{formError}</p>}

            <label>
              Item Name
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Sectional Sofa"
                required
              />
            </label>

            <label>
              Category
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Furniture, Electronics"
                required
              />
            </label>

            <label>
              Condition
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ItemCondition)}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Size
              <select
                value={sizeClass}
                onChange={(e) => setSizeClass(e.target.value as SizeClass)}
              >
                {SIZE_CLASSES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Est. Weight (lbs)
              <div className="weight-input-group">
                <input
                  className="weight-input-group__input"
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder="0"
                  value={weightLbs}
                  onChange={e => setWeightLbs(e.target.value)}
                />
                <span className="weight-input-group__suffix">lbs</span>
              </div>
            </label>

            <label>
              Notes (optional)
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any context, measurements, or reminders..."
              />
            </label>

            <div className="checkbox-row">
              <input
                id="sentimentalFlag"
                type="checkbox"
                checked={sentimentalFlag}
                onChange={(e) => setSentimentalFlag(e.target.checked)}
              />
              <label htmlFor="sentimentalFlag" style={{ marginBottom: 0 }}>
                Sentimental
              </label>
            </div>

            <div className="checkbox-row">
              <input
                id="keepFlag"
                type="checkbox"
                checked={keepFlag}
                onChange={(e) => setKeepFlag(e.target.checked)}
              />
              <label htmlFor="keepFlag" style={{ marginBottom: 0 }}>
                Keep (not for sale/donation)
              </label>
            </div>

            <div className="checkbox-row">
              <input
                id="willingToSell"
                type="checkbox"
                checked={willingToSell}
                onChange={(e) => setWillingToSell(e.target.checked)}
              />
              <label htmlFor="willingToSell" style={{ marginBottom: 0 }}>
                Willing to Sell
              </label>
            </div>

            <button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Item"}
            </button>
          </form>
        )}
      </BottomSheet>
      <BottomSheet open={editedItem !== null} onClose={() => setEditingItemId(null)} title="Edit Item">
        {editedItem && (
          <ItemEditForm
            item={editedItem}
            onSave={handleEditSave}
            onRefresh={handleEditRefresh}
            onCancel={() => setEditingItemId(null)}
            onDelete={() => setConfirmDeleteItem(editedItem)}
          />
        )}
      </BottomSheet>

      <BottomSheet open={showBulkSheet} onClose={() => setShowBulkSheet(false)} title="Bulk Actions">
        <div className="bulk-sheet__group">
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            Apply one action to {selectedIds.size} selected item{selectedIds.size === 1 ? "" : "s"}.
          </div>
          <div
            role="toolbar"
            aria-label="Bulk item actions"
            style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}
          >
            {BULK_ACTION_BUCKETS.map((a) => {
              const color = BULK_ACTION_COLOR[a];
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => void handleBulkAction(a)}
                  disabled={bulkBusy || selectedIds.size === 0}
                  style={{
                    padding: "10px 6px",
                    border: `1px solid ${color}40`,
                    borderRadius: 8,
                    background: `${color}14`,
                    color,
                    fontSize: 13,
                    fontWeight: 800,
                    textAlign: "center",
                    cursor: bulkBusy || selectedIds.size === 0 ? "default" : "pointer",
                    opacity: bulkBusy || selectedIds.size === 0 ? 0.5 : 1,
                  }}
                >
                  {bulkBusy ? "…" : BULK_ACTION_LABEL[a]}
                </button>
              );
            })}
          </div>
          {bulkError && (
            <div className="error-text" style={{ marginBottom: 8 }}>{bulkError}</div>
          )}
          <div className="sheet__actions">
            <button type="button" className="sheet__btn sheet__btn--secondary" onClick={() => setShowBulkSheet(false)}>
              Cancel
            </button>
          </div>
          <button type="button" className="item-delete-btn" onClick={() => setConfirmBulkDelete(true)}>
            Delete Selected Items
          </button>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={confirmBulkDelete}
        title="Delete Selected Items"
        description={`Delete ${selectedIds.size} selected items? This cannot be undone.`}
        confirmLabel="Delete Items"
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => void handleBulkDelete()}
      />

      <ConfirmSheet
        open={confirmDeleteItem !== null}
        title="Delete Item"
        description={confirmDeleteItem ? `Delete "${confirmDeleteItem.itemName}"? This cannot be undone.` : ""}
        confirmLabel="Delete Item"
        onCancel={() => setConfirmDeleteItem(null)}
        onConfirm={() => void handleConfirmedItemDelete()}
      />
    </div>
  );
}
