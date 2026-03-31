import { useEffect, useRef, useState } from "react";
import type { Item, ItemCondition, ItemStatus, SizeClass, Recommendation, Comparable, ComparableSource, ClarificationQuestion } from "../types";
import { api } from "../api";
import { VoiceCapture } from "./VoiceCapture";
import { BottomSheet } from "./ui/BottomSheet";
import { ConfirmSheet } from "./ui/ConfirmSheet";

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const CONDITIONS: ItemCondition[] = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"];
const SIZE_CLASSES: SizeClass[] = ["SMALL", "MEDIUM", "LARGE", "OVERSIZED"];
const STATUS_OPTIONS: ItemStatus[] = ["UNREVIEWED", "REVIEWED", "LISTED", "SOLD", "DONATED", "STORED", "SHIPPED", "DISCARDED", "KEPT"];

const REC_BADGE_TEXT: Record<Recommendation, string> = {
  SELL_NOW: "Sell Now",
  SELL_SOON: "Sell Soon",
  SHIP: "Ship",
  STORE: "Store",
  DONATE: "Donate",
  DISCARD: "Discard",
  KEEP: "Keep",
};

const REC_BADGE_CLASS: Record<Recommendation, string> = {
  SELL_NOW: "rec-badge--sell-now",
  SELL_SOON: "rec-badge--sell-soon",
  SHIP: "rec-badge--ship",
  STORE: "rec-badge--store",
  DONATE: "rec-badge--donate",
  DISCARD: "rec-badge--discard",
  KEEP: "rec-badge--keep",
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
  pricingError: boolean;
}

function ItemReadCard({
  item,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
  onIdentify,
  onPricing,
  onConfirm,
  onItemUpdated,
  identifying,
  pricing,
  confirming,
  comparables,
  identifyError,
  pricingError,
}: ItemReadCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittingClarifications, setSubmittingClarifications] = useState(false);

  const cardClass = [
    "item-card",
    selectMode ? "item-card--selectable" : "",
    selected ? "item-card--selected" : "",
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
          {item.photoPath && (
            <img
              className="item-card-thumb"
              src={`/uploads/${item.photoPath}`}
              alt=""
              loading="lazy"
            />
          )}
          <span className="item-card__name">{item.itemName}</span>
          {!selectMode && (
            <button className="item-card__edit-btn" type="button" onClick={() => onEdit(item.id)}>
              Edit
            </button>
          )}
          <RecBadge recommendation={item.recommendation} />
        </div>
        {item.recommendationReason && (
          <p className="item-card__rec-reason">{item.recommendationReason}</p>
        )}
        <div className="item-card__meta">
          <span>{item.category}</span>
          <span>·</span>
          <span>{label(item.condition)}</span>
          <span>·</span>
          <span>{label(item.sizeClass)}</span>
          {item.weightLbs != null && (
            <>
              <span>·</span>
              <span className="item-card__meta-weight">{item.weightLbs} lbs</span>
            </>
          )}
        </div>
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
            {item.identificationStatus === "SUGGESTED" && (
              <div className="id-confirm-actions">
                <button className="btn-confirm" disabled={confirming} onClick={() => onConfirm(item.id)}>
                  {confirming ? "..." : "Confirm"}
                </button>
                <button className="btn-edit-id" onClick={() => onEdit(item.id)}>Edit</button>
              </div>
            )}
          </div>
        )}

        {(() => {
          const clarifications: ClarificationQuestion[] = item.pendingClarifications
            ? JSON.parse(item.pendingClarifications)
            : [];
          if (clarifications.length === 0) return null;
          return (
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
          );
        })()}

        {item.priceFairMarket != null ? (
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
        ) : null}

        {comparables.length > 0 && (
          <div className="comp-list">
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
          </div>
        )}

        {!selectMode && (
          <div className="item-card__actions">
            {(item.identificationStatus === "NONE" || item.identificationStatus === "CONFIRMED" || item.identificationStatus === "EDITED") && (
              <button className="btn-action-sm" disabled={identifying} onClick={() => onIdentify(item.id)}>
                {identifying ? "Identifying..." : item.identificationStatus === "NONE" ? "Identify" : "Re-identify"}
              </button>
            )}
            {identifyError && <p className="item-error-text">Could not analyze this item. Try again later.</p>}
            <button className="btn-action-sm" disabled={pricing} onClick={() => onPricing(item.id)}>
              {pricing ? "Getting pricing..." : (item.priceFairMarket != null || item.pricingReasoning) ? "Retry Pricing" : "Get Pricing"}
            </button>
            {pricingError && <p className="item-error-text">Could not get pricing. Try again later.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- ItemEditForm ----------

interface ItemEditFormProps {
  item: Item;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function ItemEditForm({ item, onSave, onCancel, onDelete }: ItemEditFormProps) {
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
      await api.uploadItemPhoto(item.id, file);
      onSave(); // triggers refresh
    } catch {
      setPhotoError("Upload failed. Try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto() {
    setUploading(true);
    setPhotoError("");
    try {
      await api.deleteItemPhoto(item.id);
      onSave(); // triggers refresh
    } catch {
      setPhotoError("Failed to remove photo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="item-card item-card--editing">
      <form className="item-edit-form" onSubmit={handleSave}>
        <div className="item-edit-photo-section">
          {item.photoPath ? (
            <>
              <img className="item-edit-photo-preview" src={`/uploads/${item.photoPath}`} alt="" />
              <div className="item-edit-photo-actions">
                <button type="button" className="btn-photo-replace" disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}>
                  {uploading ? "Uploading..." : "Replace Photo"}
                </button>
                <button type="button" className="btn-photo-remove" disabled={uploading}
                  onClick={handleRemovePhoto}>
                  Remove
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn-photo-replace" disabled={uploading}
              onClick={() => fileInputRef.current?.click()}>
              {uploading ? "Uploading..." : "Add Photo"}
            </button>
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
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [comparables, setComparables] = useState<Record<string, Comparable[]>>({});
  const [identifying, setIdentifying] = useState<string | null>(null);
  const [pricing, setPricing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Voice capture toggle
  const [showVoiceCapture, setShowVoiceCapture] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

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
  const [bulkStatus, setBulkStatus] = useState<ItemStatus>("REVIEWED");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<Item | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .listItems({ roomId })
      .then(async (fetchedItems) => {
        setItems(fetchedItems);
        const pricedItems = fetchedItems.filter(i => i.priceFairMarket != null);
        const compEntries = await Promise.all(
          pricedItems.map(async i => [i.id, await api.getComparables(i.id).catch(() => [])] as const)
        );
        setComparables(Object.fromEntries(compEntries));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [roomId, refreshKey]);

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
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditSave() {
    setRefreshKey((k) => k + 1);
    setEditingItemId(null);
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

  async function handleBulkStatusUpdate(status: ItemStatus) {
    await api.bulkUpdateStatus(Array.from(selectedIds), status);
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowBulkSheet(false);
    setRefreshKey((k) => k + 1);
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
    try {
      await api.identifyItem(itemId);
      setRefreshKey(k => k + 1);
    } catch {
      setIdentifyError(itemId);
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

  function handleItemUpdated(updated: Item) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
  }

  async function handleWalkthroughComplete(itemIds: string[]) {
    if (itemIds.length === 0) return;
    setShowWalkthrough(false);
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

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        ← Back to Project
      </button>

      <div className="detail-header">
        <div className="detail-title-block">
          <h2 className="detail-name">{roomName}</h2>
          <p className="detail-route">{roomType}</p>
          {roomWeight > 0 && <p className="room-weight-total">Est. weight: {roomWeight} lbs</p>}
        </div>
      </div>

      <section>
        <div className="section-heading-row">
          <h3 className="section-heading">Items</h3>
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
                {batchProcessing ? "Identifying & Pricing Items..." : "Batch Processing Complete"}
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
                     r.status === "complete" ? "✓ Priced" :
                     r.status === "no_estimate" ? "No estimate" :
                     "✗ Error"}
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
          <p className="empty">No items yet. Add one below.</p>
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
                pricingError={pricingError === item.id}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-heading-row">
          <h3 className="section-heading">Add an Item</h3>
          <div className="section-heading-row__actions">
            <button
              className="voice-capture-btn"
              type="button"
              onClick={() => { setShowVoiceCapture(false); setShowWalkthrough(true); }}
            >
              Walkthrough
            </button>
            <button
              className="voice-capture-btn"
              type="button"
              onClick={() => { setShowWalkthrough(false); setShowVoiceCapture((v) => !v); }}
            >
              {showVoiceCapture ? "Type Instead" : "🎤 Speak"}
            </button>
          </div>
        </div>

        {showWalkthrough ? (
          <VoiceCapture
            projectId={projectId}
            roomId={roomId}
            roomType={roomType}
            walkthrough
            onItemCreated={() => setRefreshKey((k) => k + 1)}
            onCancel={() => setShowWalkthrough(false)}
            onWalkthroughComplete={handleWalkthroughComplete}
          />
        ) : showVoiceCapture ? (
          <VoiceCapture
            projectId={projectId}
            roomId={roomId}
            roomType={roomType}
            onItemCreated={() => {
              setRefreshKey((k) => k + 1);
              setShowVoiceCapture(false);
            }}
            onCancel={() => setShowVoiceCapture(false)}
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
      </section>

      <BottomSheet open={editedItem !== null} onClose={() => setEditingItemId(null)} title="Edit Item">
        {editedItem && (
          <ItemEditForm
            item={editedItem}
            onSave={handleEditSave}
            onCancel={() => setEditingItemId(null)}
            onDelete={() => setConfirmDeleteItem(editedItem)}
          />
        )}
      </BottomSheet>

      <BottomSheet open={showBulkSheet} onClose={() => setShowBulkSheet(false)} title="Bulk Actions">
        <div className="bulk-sheet__group">
          <label>
            Update Status
            <select
              className="bulk-sheet__status"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as ItemStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{label(s)}</option>
              ))}
            </select>
          </label>
          <div className="sheet__actions">
            <button type="button" className="sheet__btn sheet__btn--secondary" onClick={() => setShowBulkSheet(false)}>
              Cancel
            </button>
            <button type="button" className="sheet__btn sheet__btn--primary" onClick={() => void handleBulkStatusUpdate(bulkStatus)}>
              Apply Status
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
