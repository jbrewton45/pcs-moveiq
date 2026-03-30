import { useState, useRef } from "react";
import { useDashboardState } from "../../hooks/useDashboardState";
import type { DashboardItem, PcsContext } from "../../hooks/useDashboardState";
import { useVoiceIntake } from "../../hooks/useVoiceIntake";
import type { UrgencyBucket } from "../../types";
import {
  formatPrice, BUCKET_DISPLAY, BUCKET_CSS, BUCKET_ORDER,
  exportSession, validateSession, downloadJson,
  buildWeeklyPlan, generateIcs, downloadIcs,
} from "../shared/pricing-helpers";
import { channelToSource, buildMarketplaceUrl, getRegionChannelNotes } from "../shared/marketplace-config";
import "../../styles/dashboard.css";

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

function DashboardSummary({ items }: { items: DashboardItem[] }) {
  const analyzed = items.filter(it => it.status === "analyzed" && it.priority);
  const soldItems = items.filter(it => it.status === "sold");
  const analyzing = items.filter(it => it.status === "analyzing").length;
  const pending = items.filter(it => it.status === "pending").length;
  const failed = items.filter(it => it.status === "failed").length;

  const bucketCounts: Partial<Record<UrgencyBucket, number>> = {};
  let totalValue = 0;

  for (const it of analyzed) {
    const bucket = it.priority!.urgency.bucket;
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1;
    const price = it.priority!.pricing.recommendedPrice;
    if (price !== null) totalValue += price;
  }

  const soldValue = soldItems.reduce((sum, it) => sum + (it.soldPrice ?? it.priority?.pricing.recommendedPrice ?? 0), 0);
  const totalTrackable = analyzed.length + soldItems.length;
  const progressPct = totalTrackable > 0 ? Math.round((soldItems.length / totalTrackable) * 100) : 0;

  if (items.length === 0) return null;

  return (
    <div className="db-summary">
      <div className="db-summary__stats">
        <div className="db-summary__stat">
          <span className="db-summary__stat-value">{items.length}</span>
          <span className="db-summary__stat-label">Items</span>
        </div>
        <div className="db-summary__stat">
          <span className="db-summary__stat-value">{analyzed.length}</span>
          <span className="db-summary__stat-label">Active</span>
        </div>
        {soldItems.length > 0 && (
          <div className="db-summary__stat">
            <span className="db-summary__stat-value db-summary__stat-value--sold">{soldItems.length}</span>
            <span className="db-summary__stat-label">Sold</span>
          </div>
        )}
        {(totalValue + soldValue) > 0 && (
          <div className="db-summary__stat">
            <span className="db-summary__stat-value">${formatPrice(totalValue + soldValue)}</span>
            <span className="db-summary__stat-label">Est. Value</span>
          </div>
        )}
        {soldValue > 0 && (
          <div className="db-summary__stat">
            <span className="db-summary__stat-value db-summary__stat-value--sold">${formatPrice(soldValue)}</span>
            <span className="db-summary__stat-label">Captured</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {totalTrackable > 0 && soldItems.length > 0 && (
        <div className="db-progress">
          <div className="db-progress__bar">
            <div className="db-progress__fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="db-progress__label">
            {soldItems.length} of {totalTrackable} items sold ({progressPct}%)
          </span>
        </div>
      )}

      {(analyzing > 0 || pending > 0) && (
        <div className="db-summary__progress">
          {analyzing > 0 && <span className="db-summary__progress-text">{analyzing} analyzing</span>}
          {pending > 0 && <span className="db-summary__progress-text">{pending} queued</span>}
          {failed > 0 && <span className="db-summary__progress-text db-summary__progress-text--failed">{failed} failed</span>}
        </div>
      )}

      {Object.keys(bucketCounts).length > 0 && (
        <div className="db-summary__buckets">
          {BUCKET_ORDER.map(bucket => {
            const count = bucketCounts[bucket];
            if (!count) return null;
            const css = BUCKET_CSS[bucket];
            return (
              <span key={bucket} className={`pa-badge pa-badge--urgency-${css}`}>
                {count} {BUCKET_DISPLAY[bucket]}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PCS Context Panel
// ---------------------------------------------------------------------------

function DashboardPcsPanel({
  pcsContext, onUpdate, onReanalyzeAll, itemCount, disabled,
}: {
  pcsContext: PcsContext;
  onUpdate: (ctx: Partial<PcsContext>) => void;
  onReanalyzeAll: () => void;
  itemCount: number;
  disabled: boolean;
}) {
  return (
    <div className="pcs-context">
      <div className="pcs-context__label-row">
        <span className="pcs-context__label">PCS Context</span>
        {itemCount > 0 && (
          <button
            type="button"
            className="db-btn db-btn--small db-btn--outline"
            onClick={onReanalyzeAll}
            disabled={disabled}
          >
            Re-analyze All
          </button>
        )}
      </div>
      <div className="pcs-context__fields">
        <label className="pcs-context__field">
          <span className="pcs-context__field-label">Move date</span>
          <input
            type="date"
            className="pcs-context__input"
            value={pcsContext.pcsDate}
            onChange={(e) => onUpdate({ pcsDate: e.target.value })}
            disabled={disabled}
          />
        </label>
        <label className="pcs-context__field">
          <span className="pcs-context__field-label">Goal</span>
          <select
            className="pcs-context__select"
            value={pcsContext.userGoal}
            onChange={(e) => onUpdate({ userGoal: e.target.value })}
            disabled={disabled}
          >
            <option value="">Balanced</option>
            <option value="MAXIMIZE_CASH">Maximize Cash</option>
            <option value="REDUCE_STRESS">Reduce Stress</option>
            <option value="REDUCE_SHIPMENT_BURDEN">Reduce Shipment</option>
            <option value="FIT_SMALLER_HOME">Fit Smaller Home</option>
          </select>
        </label>
        <label className="pcs-context__field">
          <span className="pcs-context__field-label">Region</span>
          <select
            className="pcs-context__select"
            value={pcsContext.region ?? ""}
            onChange={(e) => onUpdate({ region: e.target.value || undefined })}
            disabled={disabled}
          >
            <option value="">CONUS</option>
            <option value="guam">Guam</option>
            <option value="hawaii">Hawaii</option>
            <option value="alaska">Alaska</option>
            <option value="oconus">OCONUS (other)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item Form (with voice hook)
// ---------------------------------------------------------------------------

function DashboardItemForm({ onAdd, onAddMultiple, onAddPhoto }: {
  onAdd: (query: string) => void;
  onAddMultiple: (queries: string[]) => void;
  onAddPhoto: (file: File) => void;
}) {
  const [input, setInput] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const voice = useVoiceIntake();
  const photoInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (bulkMode) {
      const queries = trimmed.split(/[\n,]+/).map(q => q.trim()).filter(q => q.length > 0);
      if (queries.length > 0) onAddMultiple(queries);
    } else {
      onAdd(trimmed);
    }
    setInput("");
  }

  function handleVoiceUse() {
    if (voice.transcript) {
      onAdd(voice.transcript);
      voice.reset();
    }
  }

  return (
    <div className="db-form">
      <form className="db-form__row" onSubmit={handleSubmit}>
        {bulkMode ? (
          <textarea
            className="db-form__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="One item per line, e.g.&#10;Sony A7R III&#10;KitchenAid mixer&#10;PS5 Digital Edition"
            rows={4}
          />
        ) : (
          <input
            className="db-form__input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add item, e.g. Sony A7R III"
          />
        )}
        <button className="db-form__btn" type="submit" disabled={!input.trim()}>
          {bulkMode ? "Add All" : "Add"}
        </button>
        {!bulkMode && voice.isAvailable && (
          <button
            type="button"
            className={`db-form__mic ${voice.state === "recording" ? "db-form__mic--active" : ""}`}
            onClick={() => {
              if (voice.state === "recording") {
                voice.stopRecording();
              } else if (voice.state === "done") {
                handleVoiceUse();
              } else {
                voice.startRecording();
              }
            }}
            title={voice.state === "recording" ? "Stop recording" : voice.state === "done" ? "Add spoken item" : "Speak item name"}
          >
            {voice.state === "recording" ? "\u23F9" : voice.state === "done" ? "\u2713" : "\u{1F3A4}"}
          </button>
        )}
        {!bulkMode && (
          <button
            type="button"
            className="db-form__mic"
            onClick={() => photoInputRef.current?.click()}
            title="Take or upload photo"
          >
            &#x1F4F7;
          </button>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAddPhoto(file);
            e.target.value = "";
          }}
        />
      </form>
      <div className="db-form__sub-row">
        <button type="button" className="db-form__toggle" onClick={() => setBulkMode(v => !v)}>
          {bulkMode ? "Single item" : "Add multiple"}
        </button>
        {voice.state === "recording" && (
          <span className="db-form__voice-status">Listening...</span>
        )}
        {voice.state === "done" && voice.transcript && (
          <span className="db-form__voice-status">
            Heard: "{voice.transcript}"
            <button type="button" className="db-form__toggle" onClick={handleVoiceUse}>Add</button>
            <button type="button" className="db-form__toggle" onClick={voice.reset}>Discard</button>
          </span>
        )}
        {voice.error && <span className="db-form__voice-error">{voice.error}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item Card (compact)
// ---------------------------------------------------------------------------

function ItemCard({ item, weekDateRange, onExpand, onRemove, onReanalyze, onMarkSold, onUndoSold, onEditSoldPrice, onConfirmIdentity }: {
  item: DashboardItem;
  weekDateRange?: string | null;
  onExpand: () => void;
  onRemove: () => void;
  onReanalyze: () => void;
  onMarkSold: () => void;
  onUndoSold: () => void;
  onEditSoldPrice: () => void;
  onConfirmIdentity: (confirmedName?: string) => void;
}) {
  const [editName, setEditName] = useState("");
  const p = item.priority;
  const bucket = p?.urgency.bucket;
  const css = bucket ? BUCKET_CSS[bucket] : undefined;
  const displayLabel = bucket ? BUCKET_DISPLAY[bucket] : undefined;
  const recPrice = p?.pricing.recommendedPrice;
  const topChannel = p?.channels[0]?.channel;
  const isSold = item.status === "sold";

  return (
    <div className={`db-card ${css ? `db-card--${css}` : ""} ${isSold ? "db-card--sold" : ""}`} onClick={item.status === "needs_confirmation" ? undefined : onExpand}>
      {/* Photo thumbnail */}
      {item.photoDataUrl && (
        <img className="db-card__photo" src={item.photoDataUrl} alt="" />
      )}
      <div className="db-card__main">
        {/* Identification states */}
        {item.status === "identifying" && (
          <div className="db-card__title-row">
            <span className="db-card__spinner" />
            <span className="db-card__status db-card__status--identifying">Identifying...</span>
          </div>
        )}
        {item.status === "needs_confirmation" && item.identification && (
          <div className="db-card__confirm" onClick={(e) => e.stopPropagation()}>
            <span className="db-card__confirm-label">Identified as:</span>
            <input
              className="db-card__confirm-input"
              type="text"
              defaultValue={item.identification.suggestedName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={item.identification.suggestedName}
            />
            <div className="db-card__confirm-meta">
              <span className="db-card__confirm-detail">{item.identification.category}</span>
              <span className="db-card__confirm-detail">{item.identification.condition}</span>
              <span className="db-card__confirm-detail">{item.identification.sizeClass}</span>
            </div>
            <div className="db-card__confirm-actions">
              <button type="button" className="db-btn db-btn--small db-form__btn" onClick={() => onConfirmIdentity(editName || undefined)}>
                Confirm
              </button>
              <button type="button" className="db-btn db-btn--small db-btn--outline" onClick={onRemove}>
                Discard
              </button>
            </div>
          </div>
        )}
        {/* Normal title row (for non-identification states) */}
        {item.status !== "identifying" && item.status !== "needs_confirmation" && (
        <div className="db-card__title-row">
          <span className={`db-card__title ${isSold ? "db-card__title--sold" : ""}`}>{item.query}</span>
          {item.status === "analyzing" && <span className="db-card__spinner" />}
          {item.status === "failed" && <span className="db-card__status db-card__status--failed">Failed</span>}
          {item.status === "pending" && <span className="db-card__status db-card__status--pending">Queued</span>}
          {isSold && <span className="db-card__status db-card__status--sold">Sold</span>}
        </div>
        )}
        {p && !isSold && (
          <>
            <div className="db-card__result">
              <span className={`pa-badge pa-badge--urgency-${css}`}>{displayLabel}</span>
              {recPrice !== null && recPrice !== undefined && (
                <span className="db-card__price">${formatPrice(recPrice)}</span>
              )}
              {topChannel && <ChannelLink channel={topChannel} query={item.query} />}
            </div>
            {/* Timeline date + action plan */}
            <div className="db-card__plan">
              {weekDateRange && <span className="db-card__date">Sell by: {weekDateRange}</span>}
              {p.urgency.adjustedDaysToPCS !== null && p.urgency.daysUntilPCS !== null &&
                p.urgency.adjustedDaysToPCS < p.urgency.daysUntilPCS && (
                <span className="db-card__adjusted">
                  {p.urgency.adjustedDaysToPCS}d effective ({p.urgency.daysUntilPCS}d raw)
                </span>
              )}
              {p.pricing.originalTiers && bucket === "SELL_IMMEDIATELY" && (
                <span className="db-card__action-plan">
                  List at ${formatPrice(p.pricing.originalTiers.fastSale)}, drop to ${formatPrice(Math.round(p.pricing.originalTiers.fastSale * 0.85))} in 5 days
                </span>
              )}
            </div>
          </>
        )}
        {isSold && (
          <div className="db-card__result">
            <span className="pa-badge pa-badge--urgency-sold">Sold</span>
            {item.soldPrice != null && (
              <span className="db-card__price">${formatPrice(item.soldPrice)}</span>
            )}
          </div>
        )}
        {item.error && <p className="db-card__error">{item.error}</p>}
      </div>
      <div className="db-card__actions" onClick={(e) => e.stopPropagation()}>
        {item.status === "analyzed" && (
          <button type="button" className="db-card__action db-card__action--sold" onClick={onMarkSold} title="Mark as Sold">&#x2713;</button>
        )}
        {isSold && (
          <>
            <button type="button" className="db-card__action" onClick={onEditSoldPrice} title="Edit sold price">&#x270E;</button>
            <button type="button" className="db-card__action" onClick={onUndoSold} title="Undo sold">&#x21B6;</button>
          </>
        )}
        {(item.status === "analyzed" || item.status === "failed") && (
          <button type="button" className="db-card__action" onClick={onReanalyze} title="Re-analyze">&#x21bb;</button>
        )}
        <button type="button" className="db-card__action db-card__action--delete" onClick={onRemove} title="Remove">&times;</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel Link (marketplace-aware)
// ---------------------------------------------------------------------------

function ChannelLink({ channel, query }: { channel: string; query: string }) {
  const source = channelToSource(channel);
  const url = buildMarketplaceUrl(source, query);
  if (url) {
    return (
      <a
        className="db-card__channel db-card__channel--link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {channel} &#x2197;
      </a>
    );
  }
  return <span className="db-card__channel">{channel}</span>;
}

// ---------------------------------------------------------------------------
// Item Detail (expanded)
// ---------------------------------------------------------------------------

function ItemDetail({ item, onClose }: { item: DashboardItem; onClose: () => void }) {
  const p = item.priority;

  if (!p) {
    return (
      <div className="db-detail">
        <div className="db-detail__header">
          <h3 className="db-detail__title">{item.query}</h3>
          <button type="button" className="db-detail__close" onClick={onClose}>&times;</button>
        </div>
        {item.error && <p className="db-card__error">{item.error}</p>}
        {!item.error && <p className="db-detail__summary">No analysis results yet.</p>}
      </div>
    );
  }

  const { urgency, channels, pricing } = p;
  const css = BUCKET_CSS[urgency.bucket] ?? "minimal";
  const displayLabel = BUCKET_DISPLAY[urgency.bucket] ?? urgency.bucket;
  const analysis = p.ebayAnalysis;

  return (
    <div className="db-detail">
      <div className="db-detail__header">
        <h3 className="db-detail__title">{item.query}</h3>
        <button type="button" className="db-detail__close" onClick={onClose}>&times;</button>
      </div>

      <div className={`pcs-urgency pcs-urgency--${css}`}>
        <div className="pcs-urgency__header">
          <div className="pcs-urgency__badge-row">
            <span className={`pa-badge pa-badge--urgency-${css}`}>{displayLabel}</span>
            <span className="pcs-urgency__score">Score: {urgency.score}/100</span>
          </div>
          {urgency.daysUntilPCS !== null && (
            <span className="pcs-urgency__days">
              {urgency.daysUntilPCS} day{urgency.daysUntilPCS === 1 ? "" : "s"} until PCS
              {urgency.adjustedDaysToPCS !== null && urgency.adjustedDaysToPCS < urgency.daysUntilPCS && (
                <span className="pcs-urgency__adjusted">
                  {" "}(effective: {urgency.adjustedDaysToPCS}d due to location)
                </span>
              )}
            </span>
          )}
        </div>

        <p className="pcs-urgency__headline">{urgency.headline}</p>

        {pricing.recommendedPrice !== null && pricing.originalTiers && (
          <div className="pcs-urgency__price-row">
            <span className="pcs-urgency__rec-price">${formatPrice(pricing.recommendedPrice)}</span>
            <span className="pcs-urgency__price-label">Recommended Price</span>
          </div>
        )}

        {pricing.originalTiers && (
          <div className="pricing-bands">
            <div className="pricing-band">
              <span className="pricing-band__value">${formatPrice(pricing.originalTiers.fastSale)}</span>
              <span className="pricing-band__label">Fast Sale</span>
            </div>
            <div className="pricing-band">
              <span className="pricing-band__value">${formatPrice(pricing.originalTiers.fairMarket)}</span>
              <span className="pricing-band__label">Fair Market</span>
            </div>
            <div className="pricing-band">
              <span className="pricing-band__value">${formatPrice(pricing.originalTiers.maxReach)}</span>
              <span className="pricing-band__label">Max Reach</span>
            </div>
          </div>
        )}

        <div className="pcs-urgency__strategy">
          <span className="pa-strategy__label">Pricing strategy</span>
          <span className="pa-strategy__text">{pricing.pricingStrategy}</span>
        </div>

        {channels.length > 0 && (
          <div className="pcs-urgency__channels">
            <span className="pcs-urgency__channels-label">Where to sell</span>
            <div className="pcs-urgency__channel-list">
              {channels.map((ch) => (
                <div key={ch.channel} className={`pcs-channel ${ch.fits ? "" : "pcs-channel--no-fit"}`}>
                  <div className="pcs-channel__header">
                    <span className="pcs-channel__rank">#{ch.rank}</span>
                    <ChannelLink channel={ch.channel} query={item.query} />
                    <span className="pcs-channel__speed">{ch.estimatedDaysToSell}</span>
                  </div>
                  <p className="pcs-channel__reason">{ch.reason}</p>
                  {!ch.fits && <span className="pcs-channel__warning">May not complete before PCS</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="pcs-urgency__reasoning-details">
          <summary className="pcs-urgency__reasoning-toggle">Scoring breakdown</summary>
          <ul className="pcs-urgency__reasoning-list">
            {urgency.reasoning.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </details>
      </div>

      <div className="db-detail__market">
        <span className={`pa-badge pa-badge--health-${analysis.analysis.marketHealth}`}>
          {analysis.analysis.marketHealth} market
        </span>
        <span className={`pa-badge pa-badge--confidence-${analysis.analysis.confidenceLabel}`}>
          {analysis.analysis.confidenceLabel} confidence
        </span>
      </div>

      <p className="db-detail__summary">{analysis.analysis.summary}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline View
// ---------------------------------------------------------------------------

function DashboardTimeline({ items, pcsContext, onExportCalendar }: {
  items: DashboardItem[];
  pcsContext: PcsContext;
  onExportCalendar: () => void;
}) {
  const plan = buildWeeklyPlan(items, pcsContext);
  const regionNotes = getRegionChannelNotes(pcsContext.region);

  if (plan.summary.totalItems === 0) {
    return (
      <div className="db-timeline__empty">
        <p className="pa-empty__text">Analyze items to see your weekly sell plan.</p>
      </div>
    );
  }

  return (
    <div className="db-timeline">
      {/* Top strip summary */}
      <div className="db-timeline__strip">
        {plan.summary.sellNowCount > 0 && (
          <span className="db-timeline__strip-item db-timeline__strip-item--urgent">
            {plan.summary.sellNowCount} to sell now
            {plan.summary.totalValueSellNow > 0 && (
              <> &mdash; ${formatPrice(plan.summary.totalValueSellNow)} potential</>
            )}
          </span>
        )}
        {plan.summary.soldCount > 0 && (
          <span className="db-timeline__strip-item db-timeline__strip-item--sold">
            {plan.summary.soldCount} sold &mdash; ${formatPrice(plan.summary.totalSoldValue)} captured
          </span>
        )}
        {plan.summary.bulkyCount > 0 && (
          <span className="db-timeline__strip-item">
            {plan.summary.bulkyCount} bulky item{plan.summary.bulkyCount !== 1 ? "s" : ""} (list locally first)
          </span>
        )}
        {plan.donate.length > 0 && (
          <span className="db-timeline__strip-item">
            {plan.donate.length} to donate/bundle
          </span>
        )}
        {plan.originNote && (
          <span className="db-timeline__strip-item db-timeline__strip-item--origin">
            {plan.originNote}
          </span>
        )}
        {pcsContext.pcsDate && (
          <button type="button" className="db-btn db-btn--small db-btn--outline" onClick={onExportCalendar} style={{ marginLeft: "auto" }}>
            Export Calendar
          </button>
        )}
      </div>

      {/* Region-specific channel notes */}
      {regionNotes.length > 0 && (
        <div className="db-timeline__region-notes">
          <span className="db-timeline__region-label">Local channels ({pcsContext.region})</span>
          {regionNotes.map(n => (
            <span key={n.channel} className="db-timeline__region-note">
              {n.channel} &mdash; {n.note}
            </span>
          ))}
        </div>
      )}

      {/* Do This First — top 3 priority items with action plans */}
      {plan.topPriority.length > 0 && (
        <div className="db-top-priority">
          <span className="db-top-priority__label">Do This First</span>
          <div className="db-top-priority__items">
            {plan.topPriority.map((item, idx) => {
              const p = item.priority!;
              const css = BUCKET_CSS[p.urgency.bucket];
              const price = p.pricing.recommendedPrice;
              const channel = p.channels[0]?.channel;
              const week = plan.itemWeekMap.get(item.id);
              const tiers = p.pricing.originalTiers;
              return (
                <div key={item.id} className={`db-top-priority__card db-top-priority__card--${css}`}>
                  <span className="db-top-priority__rank">#{idx + 1}</span>
                  <span className="db-top-priority__title">{item.query}</span>
                  <div className="db-top-priority__meta">
                    {price != null && <span className="db-top-priority__price">${formatPrice(price)}</span>}
                    {channel && <span className="db-top-priority__channel">{channel}</span>}
                  </div>
                  {week?.dateRange && (
                    <span className="db-top-priority__date">Sell by: {week.dateRange}</span>
                  )}
                  <span className="db-top-priority__action">
                    {p.urgency.bucket === "SELL_IMMEDIATELY" && tiers
                      ? `List at $${formatPrice(tiers.fastSale)} — drop to $${formatPrice(Math.round(tiers.fastSale * 0.85))} in 5 days`
                      : BUCKET_DISPLAY[p.urgency.bucket]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week columns */}
      <div className="db-timeline__weeks">
        {plan.weeks.map(week => {
          // Determine week status: past, current, or future
          let weekStatus = "";
          if (week.startDate) {
            const weekStart = new Date(week.startDate);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            if (weekEnd < now) {
              weekStatus = "db-timeline__week--past";
            } else if (weekStart <= now && now <= weekEnd) {
              weekStatus = "db-timeline__week--current";
            }
          }
          return (
          <div key={week.weekIndex} className={`db-timeline__week ${weekStatus}`}>
            <div className="db-timeline__week-header">
              <div>
                <span className="db-timeline__week-label">
                  {week.label}
                  {weekStatus === "db-timeline__week--current" && " \u2190 This week"}
                  {weekStatus === "db-timeline__week--past" && week.items.length > 0 && " \u2014 Past due"}
                </span>
                {week.dateRange && (
                  <span className="db-timeline__week-date">{week.dateRange}</span>
                )}
              </div>
              {week.weekValue > 0 && (
                <span className="db-timeline__week-value">${formatPrice(week.weekValue)}</span>
              )}
            </div>
            <div className="db-timeline__week-items">
              {week.items.map(item => {
                const css = BUCKET_CSS[item.priority!.urgency.bucket];
                const price = item.priority?.pricing.recommendedPrice;
                const topCh = item.priority?.channels[0]?.channel;
                return (
                  <div key={item.id} className={`db-timeline__item db-timeline__item--${css}`}>
                    <span className="db-timeline__item-title">{item.query}</span>
                    <div className="db-timeline__item-meta">
                      {price !== null && price !== undefined && (
                        <span className="db-timeline__item-price">${formatPrice(price)}</span>
                      )}
                      {topCh && <span className="db-timeline__item-channel">{topCh}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}

        {/* Donate lane */}
        {plan.donate.length > 0 && (
          <div className="db-timeline__week db-timeline__week--donate">
            <div className="db-timeline__week-header">
              <span className="db-timeline__week-label">Donate / Bundle</span>
            </div>
            <div className="db-timeline__week-items">
              {plan.donate.map(item => (
                <div key={item.id} className="db-timeline__item db-timeline__item--donate">
                  <span className="db-timeline__item-title">{item.query}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sold lane */}
        {plan.sold.length > 0 && (
          <div className="db-timeline__week db-timeline__week--sold">
            <div className="db-timeline__week-header">
              <span className="db-timeline__week-label">Completed</span>
              <span className="db-timeline__week-value db-timeline__week-value--sold">
                ${formatPrice(plan.summary.totalSoldValue)}
              </span>
            </div>
            <div className="db-timeline__week-items">
              {plan.sold.map(item => (
                <div key={item.id} className="db-timeline__item db-timeline__item--sold">
                  <span className="db-timeline__item-title">{item.query}</span>
                  <div className="db-timeline__item-meta">
                    {item.soldPrice != null && (
                      <span className="db-timeline__item-price">${formatPrice(item.soldPrice)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortMode = "urgency" | "value" | "name" | "added";

function sortItems(items: DashboardItem[], mode: SortMode): DashboardItem[] {
  const copy = [...items];
  switch (mode) {
    case "urgency": {
      const statusOrder: Record<string, number> = { needs_confirmation: 0, analyzed: 1, failed: 2, analyzing: 3, identifying: 4, pending: 5, sold: 6 };
      return copy.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 4;
        const sb = statusOrder[b.status] ?? 4;
        if (sa !== sb) return sa - sb;
        if (!a.priority || !b.priority) return 0;
        const ai = BUCKET_ORDER.indexOf(a.priority.urgency.bucket);
        const bi = BUCKET_ORDER.indexOf(b.priority.urgency.bucket);
        if (ai !== bi) return ai - bi;
        return b.priority.urgency.score - a.priority.urgency.score;
      });
    }
    case "value":
      return copy.sort((a, b) => {
        const av = a.priority?.pricing.recommendedPrice ?? -1;
        const bv = b.priority?.pricing.recommendedPrice ?? -1;
        return bv - av;
      });
    case "name":
      return copy.sort((a, b) => a.query.localeCompare(b.query));
    case "added":
      return copy.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    default:
      return copy;
  }
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

type ViewMode = "list" | "timeline";

export function SellDashboard() {
  const {
    items, pcsContext, isProcessing,
    addItem, addMultiple, removeItem, reanalyzeItem,
    reanalyzeAll, clearAll, updatePcsContext, replaceAll,
    markAsSold, undoSold, editSoldPrice, addPhotoItem, confirmIdentity,
  } = useDashboardState();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("urgency");
  const [filterBucket, setFilterBucket] = useState<UrgencyBucket | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const expandedItem = expandedId ? items.find(it => it.id === expandedId) : null;

  // Compute plan once for both views (timeline + list card dates)
  const plan = items.length > 0 ? buildWeeklyPlan(items, pcsContext) : null;

  // Apply filter
  let visibleItems = items;
  if (filterBucket !== "all") {
    visibleItems = items.filter(it =>
      it.status === "identifying" || it.status === "needs_confirmation" ||
      (it.status !== "sold" && it.priority?.urgency.bucket === filterBucket)
    );
  }
  const sorted = sortItems(visibleItems, sortMode);

  function handleMarkSold(id: string) {
    const priceStr = window.prompt("Sold price (leave blank to use estimate):");
    if (priceStr === null) return;
    const soldPrice = priceStr ? parseFloat(priceStr) : undefined;
    if (priceStr && (isNaN(soldPrice!) || soldPrice! < 0)) return;
    markAsSold(id, soldPrice);
  }

  function handleUndoSold(id: string) {
    undoSold(id);
  }

  function handleEditSoldPrice(id: string) {
    const item = items.find(it => it.id === id);
    if (!item || item.status !== "sold") return;
    const current = item.soldPrice != null ? String(item.soldPrice) : "";
    const priceStr = window.prompt("Edit sold price:", current);
    if (priceStr === null) return;
    const newPrice = priceStr ? parseFloat(priceStr) : undefined;
    if (priceStr && (isNaN(newPrice!) || newPrice! < 0)) return;
    editSoldPrice(id, newPrice);
  }

  function handleExportCalendar() {
    if (!pcsContext.pcsDate) return;
    const plan = buildWeeklyPlan(items, pcsContext);
    const ics = generateIcs(plan, pcsContext.pcsDate);
    downloadIcs(ics, `pcs-sell-plan-${pcsContext.pcsDate}.ics`);
  }

  // --- Session export/import ---
  function handleExport() {
    const json = exportSession(items, pcsContext);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadJson(json, `pcs-moveiq-session-${dateStr}.json`);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const session = validateSession(parsed);
        if (!session) {
          setImportError("Invalid session file format");
          return;
        }
        if (items.length > 0 && !window.confirm(`Import ${session.items.length} items? This will replace your current ${items.length} items.`)) {
          return;
        }
        replaceAll(session.items, session.pcsContext);
      } catch {
        setImportError("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = "";
  }

  return (
    <section className="stacked-view db-page">
      {/* Single hidden file input for session import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />

      <div className="pa-page-header">
        <h2 className="section-heading">PCS Sell Dashboard</h2>
        <p className="pa-page-subtitle">
          Add items you might sell, get pricing and urgency recommendations for your PCS timeline.
        </p>
      </div>

      <DashboardPcsPanel
        pcsContext={pcsContext}
        onUpdate={updatePcsContext}
        onReanalyzeAll={reanalyzeAll}
        itemCount={items.length}
        disabled={isProcessing}
      />

      <DashboardItemForm
        onAdd={addItem}
        onAddMultiple={addMultiple}
        onAddPhoto={(file) => { void addPhotoItem(file); }}
      />

      <DashboardSummary items={items} />

      {items.length > 0 && (
        <div className="db-controls">
          {/* View toggle */}
          <div className="db-controls__view">
            <button
              type="button"
              className={`db-view-btn ${viewMode === "list" ? "db-view-btn--active" : ""}`}
              onClick={() => setViewMode("list")}
            >
              List
            </button>
            <button
              type="button"
              className={`db-view-btn ${viewMode === "timeline" ? "db-view-btn--active" : ""}`}
              onClick={() => setViewMode("timeline")}
            >
              Timeline
            </button>
          </div>

          {viewMode === "list" && (
            <>
              <div className="db-controls__sort">
                <label className="db-controls__label">Sort</label>
                <select
                  className="db-controls__select"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                >
                  <option value="urgency">By Urgency</option>
                  <option value="value">By Value</option>
                  <option value="name">By Name</option>
                  <option value="added">Recently Added</option>
                </select>
              </div>
              <div className="db-controls__filter">
                <label className="db-controls__label">Filter</label>
                <select
                  className="db-controls__select"
                  value={filterBucket}
                  onChange={(e) => setFilterBucket(e.target.value as UrgencyBucket | "all")}
                >
                  <option value="all">All</option>
                  {BUCKET_ORDER.map(b => (
                    <option key={b} value={b}>{BUCKET_DISPLAY[b]}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Session controls */}
          <div className="db-controls__session">
            <button type="button" className="db-btn db-btn--small db-btn--outline" onClick={handleExport}>
              Export
            </button>
            <button type="button" className="db-btn db-btn--small db-btn--outline" onClick={handleImportClick}>
              Import
            </button>
            <button
              type="button"
              className="db-btn db-btn--small db-btn--danger"
              onClick={() => { if (window.confirm("Remove all items from dashboard?")) clearAll(); }}
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {importError && <p className="form-error">{importError}</p>}

      {/* Timeline view */}
      {viewMode === "timeline" && items.length > 0 && (
        <DashboardTimeline items={items} pcsContext={pcsContext} onExportCalendar={handleExportCalendar} />
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div className="db-list">
          {sorted.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              weekDateRange={plan?.itemWeekMap.get(item.id)?.dateRange}
              onExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onRemove={() => removeItem(item.id)}
              onReanalyze={() => reanalyzeItem(item.id)}
              onMarkSold={() => handleMarkSold(item.id)}
              onUndoSold={() => handleUndoSold(item.id)}
              onEditSoldPrice={() => handleEditSoldPrice(item.id)}
              onConfirmIdentity={(name) => confirmIdentity(item.id, name)}
            />
          ))}
        </div>
      )}

      {/* Expanded detail */}
      {expandedItem && (expandedItem.priority || expandedItem.error) && (
        <div className="db-detail-overlay" onClick={() => setExpandedId(null)}>
          <div className="db-detail-container" onClick={(e) => e.stopPropagation()}>
            <ItemDetail item={expandedItem} onClose={() => setExpandedId(null)} />
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="pa-empty">
          <p className="pa-empty__text">
            Add items above to start building your PCS sell plan.
          </p>
          {/* Import button for empty state too */}
          <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)", justifyContent: "center" }}>
            <button type="button" className="db-btn db-btn--small db-btn--outline" onClick={handleImportClick}>
              Import Session
            </button>
          </div>
        </div>
      )}

      {items.length > 0 && viewMode === "list" && sorted.length === 0 && (
        <div className="pa-empty">
          <p className="pa-empty__text">
            No items match the current filter.
            {" "}<button type="button" className="db-form__toggle" onClick={() => setFilterBucket("all")}>Show all</button>
          </p>
        </div>
      )}
    </section>
  );
}
