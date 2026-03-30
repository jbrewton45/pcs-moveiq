import { useState } from "react";
import { api } from "../api";
import type { EbayAnalysisResult, SellPriorityResult } from "../types";
import { formatPrice, healthLabel, BUCKET_DISPLAY, BUCKET_CSS } from "./shared/pricing-helpers";

interface GroupCardProps {
  group: EbayAnalysisResult["groups"][number];
}

function GroupCard({ group }: GroupCardProps) {
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? group.items : group.items.slice(0, 5);
  const hasMore = group.items.length > 5;

  return (
    <div className="pa-group">
      <div className="pa-group__header">
        <div className="pa-group__title-row">
          <h4 className="pa-group__label">{group.label}</h4>
          <span className="pa-group__count">
            {group.matchCount} listing{group.matchCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="pricing-bands">
          <div className="pricing-band">
            <span className="pricing-band__value">${formatPrice(group.derivedPricing.fastSale)}</span>
            <span className="pricing-band__label">Fast Sale</span>
          </div>
          <div className="pricing-band">
            <span className="pricing-band__value">${formatPrice(group.derivedPricing.fairMarket)}</span>
            <span className="pricing-band__label">Fair Market</span>
          </div>
          <div className="pricing-band">
            <span className="pricing-band__value">${formatPrice(group.derivedPricing.maxReach)}</span>
            <span className="pricing-band__label">Max Reach</span>
          </div>
        </div>
      </div>

      {group.reasoning.length > 0 && (
        <ul className="pa-group__reasoning">
          {group.reasoning.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <div className="pa-group__listings">
        {visibleItems.map((item) => (
          <div key={item.itemId} className="comp-card">
            {item.imageUrl && (
              <img className="comp-card__thumb" src={item.imageUrl} alt="" />
            )}
            <div className="comp-card__info">
              {item.itemWebUrl ? (
                <a
                  className="comp-card__title comp-card__title-link"
                  href={item.itemWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.title}
                </a>
              ) : (
                <span className="comp-card__title">{item.title}</span>
              )}
              <div className="comp-card__source-row">
                <span className="comp-source-badge comp-source-badge--ebay">eBay</span>
                {item.condition && (
                  <span className="pa-condition-badge">{item.condition}</span>
                )}
              </div>
            </div>
            <div className="comp-card__right">
              <span className="comp-card__price">${formatPrice(item.price)}</span>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          className="pa-group__toggle"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? "Show fewer listings"
            : `Show all ${group.items.length} listings`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Urgency Card
// ---------------------------------------------------------------------------

function UrgencyCard({ priority }: { priority: SellPriorityResult }) {
  const { urgency, channels, pricing } = priority;
  const cssClass = BUCKET_CSS[urgency.bucket] ?? "minimal";
  const displayLabel = BUCKET_DISPLAY[urgency.bucket] ?? urgency.bucket;

  return (
    <div className={`pcs-urgency pcs-urgency--${cssClass}`}>
      <div className="pcs-urgency__header">
        <div className="pcs-urgency__badge-row">
          <span className={`pa-badge pa-badge--urgency-${cssClass}`}>
            {displayLabel}
          </span>
          <span className="pcs-urgency__score">
            Score: {urgency.score}/100
          </span>
        </div>
        {urgency.daysUntilPCS !== null && (
          <span className="pcs-urgency__days">
            {urgency.daysUntilPCS} day{urgency.daysUntilPCS === 1 ? "" : "s"} until PCS
          </span>
        )}
      </div>

      <p className="pcs-urgency__headline">{urgency.headline}</p>

      {pricing.recommendedPrice !== null && pricing.originalTiers && (
        <div className="pcs-urgency__price-row">
          <span className="pcs-urgency__rec-price">
            ${formatPrice(pricing.recommendedPrice)}
          </span>
          <span className="pcs-urgency__price-label">Recommended Price</span>
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
              <div
                key={ch.channel}
                className={`pcs-channel ${ch.fits ? "" : "pcs-channel--no-fit"}`}
              >
                <div className="pcs-channel__header">
                  <span className="pcs-channel__rank">#{ch.rank}</span>
                  <span className="pcs-channel__name">{ch.channel}</span>
                  <span className="pcs-channel__speed">{ch.estimatedDaysToSell}</span>
                </div>
                <p className="pcs-channel__reason">{ch.reason}</p>
                {!ch.fits && (
                  <span className="pcs-channel__warning">May not complete before PCS</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="pcs-urgency__reasoning-details">
        <summary className="pcs-urgency__reasoning-toggle">Scoring breakdown</summary>
        <ul className="pcs-urgency__reasoning-list">
          {urgency.reasoning.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PCS Context Panel
// ---------------------------------------------------------------------------

interface PcsContextProps {
  pcsDate: string;
  onPcsDateChange: (v: string) => void;
  sizeClass: string;
  onSizeClassChange: (v: string) => void;
  userGoal: string;
  onUserGoalChange: (v: string) => void;
  disabled: boolean;
}

function PcsContextPanel({
  pcsDate, onPcsDateChange,
  sizeClass, onSizeClassChange,
  userGoal, onUserGoalChange,
  disabled,
}: PcsContextProps) {
  return (
    <div className="pcs-context">
      <span className="pcs-context__label">PCS Context (optional)</span>
      <div className="pcs-context__fields">
        <label className="pcs-context__field">
          <span className="pcs-context__field-label">Move date</span>
          <input
            type="date"
            className="pcs-context__input"
            value={pcsDate}
            onChange={(e) => onPcsDateChange(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="pcs-context__field">
          <span className="pcs-context__field-label">Size</span>
          <select
            className="pcs-context__select"
            value={sizeClass}
            onChange={(e) => onSizeClassChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">Any</option>
            <option value="SMALL">Small</option>
            <option value="MEDIUM">Medium</option>
            <option value="LARGE">Large</option>
            <option value="OVERSIZED">Oversized</option>
          </select>
        </label>
        <label className="pcs-context__field">
          <span className="pcs-context__field-label">Goal</span>
          <select
            className="pcs-context__select"
            value={userGoal}
            onChange={(e) => onUserGoalChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">Balanced</option>
            <option value="MAXIMIZE_CASH">Maximize Cash</option>
            <option value="REDUCE_STRESS">Reduce Stress</option>
            <option value="REDUCE_SHIPMENT_BURDEN">Reduce Shipment</option>
            <option value="FIT_SMALLER_HOME">Fit Smaller Home</option>
          </select>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface PricingAnalysisProps {
  onBack: () => void;
}

export function PricingAnalysis({ onBack }: PricingAnalysisProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // PCS context fields
  const [pcsDate, setPcsDate] = useState("");
  const [sizeClass, setSizeClass] = useState("");
  const [userGoal, setUserGoal] = useState("");

  // Results
  const [result, setResult] = useState<EbayAnalysisResult | null>(null);
  const [priority, setPriority] = useState<SellPriorityResult | null>(null);

  const hasPcsContext = pcsDate !== "" || sizeClass !== "" || userGoal !== "";

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setResult(null);
    setPriority(null);

    try {
      if (hasPcsContext) {
        // Use priority endpoint when PCS context is provided
        const data = await api.getSellPriority({
          query: trimmed,
          pcsDate: pcsDate || undefined,
          sizeClass: sizeClass || undefined,
          userGoal: userGoal || undefined,
        });
        setPriority(data);
        setResult(data.ebayAnalysis);
      } else {
        // Plain analysis when no PCS context
        const data = await api.analyzeEbayPricing(trimmed);
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stacked-view">
      <button type="button" className="back-btn" onClick={onBack}>
        &larr; Back
      </button>

      <div className="pa-page-header">
        <h2 className="section-heading">eBay Price Analysis</h2>
        <p className="pa-page-subtitle">
          Search any item to get real-time pricing data and comparable listings from eBay.
          {" "}Add your PCS date for sell-priority recommendations.
        </p>
      </div>

      <div className="pa-search">
        <form className="pa-search__form" onSubmit={handleSearch}>
          <input
            className="pa-search__input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Sony A7R III, KitchenAid mixer, PS5..."
            required
            disabled={loading}
          />
          <button className="pa-search__btn" type="submit" disabled={loading}>
            {loading ? "Analyzing..." : hasPcsContext ? "Analyze + Priority" : "Analyze"}
          </button>
        </form>
      </div>

      <PcsContextPanel
        pcsDate={pcsDate}
        onPcsDateChange={setPcsDate}
        sizeClass={sizeClass}
        onSizeClassChange={setSizeClass}
        userGoal={userGoal}
        onUserGoalChange={setUserGoal}
        disabled={loading}
      />

      {error && <p className="form-error">{error}</p>}

      {loading && (
        <div className="pa-loading">
          <div className="pa-loading__bar" />
          <p className="pa-loading__text">
            {hasPcsContext
              ? "Analyzing pricing and computing sell priority\u2026"
              : "Fetching eBay listings and analyzing pricing\u2026"}
          </p>
        </div>
      )}

      {/* Urgency card — shown above analysis when PCS context present */}
      {priority && <UrgencyCard priority={priority} />}

      {result && (
        <div className="pa-results">
          {/* Top-level analysis card */}
          <div className="pa-result">
            <div className="pa-result__header">
              <h3 className="pa-result__query">{result.analysis.canonicalQuery}</h3>
              <div className="pa-result__badges">
                <span className={`pa-badge pa-badge--health-${result.analysis.marketHealth}`}>
                  {healthLabel(result.analysis.marketHealth)}
                </span>
                <span className={`pa-badge pa-badge--confidence-${result.analysis.confidenceLabel}`}>
                  {result.analysis.confidenceLabel} confidence
                </span>
              </div>
            </div>

            {result.analysis.pricingTiers ? (
              <div className="pricing-bands">
                <div className="pricing-band">
                  <span className="pricing-band__value">
                    ${formatPrice(result.analysis.pricingTiers.fastSale)}
                  </span>
                  <span className="pricing-band__label">Fast Sale</span>
                </div>
                <div className="pricing-band">
                  <span className="pricing-band__value">
                    ${formatPrice(result.analysis.pricingTiers.fairMarket)}
                  </span>
                  <span className="pricing-band__label">Fair Market</span>
                </div>
                <div className="pricing-band">
                  <span className="pricing-band__value">
                    ${formatPrice(result.analysis.pricingTiers.maxReach)}
                  </span>
                  <span className="pricing-band__label">Max Reach</span>
                </div>
              </div>
            ) : (
              <div className="pa-no-estimate">
                <p className="pa-no-estimate__title">No trustworthy estimate</p>
                <p className="pa-no-estimate__text">{result.analysis.summary}</p>
              </div>
            )}

            <p className="pa-result__summary">{result.analysis.summary}</p>

            {/* Only show generic strategy when NOT in priority mode */}
            {!priority && result.analysis.recommendedListingStrategy && (
              <div className="pa-strategy">
                <span className="pa-strategy__label">Listing strategy</span>
                <span className="pa-strategy__text">
                  {result.analysis.recommendedListingStrategy}
                </span>
              </div>
            )}
          </div>

          {/* Comparable groups */}
          {result.groups.length > 0 && (
            <div className="pa-groups">
              <p className="pa-groups__heading">
                {result.groups.length} comparable group{result.groups.length !== 1 ? "s" : ""}
              </p>
              {result.groups.map((group) => (
                <GroupCard key={group.groupKey} group={group} />
              ))}
            </div>
          )}

          {/* Excluded summary */}
          {result.excluded.count > 0 && (
            <div className="pa-excluded">
              <span className="pa-excluded__count">
                {result.excluded.count} listing{result.excluded.count !== 1 ? "s" : ""} excluded
              </span>
              <div className="pa-excluded__reasons">
                {result.excluded.reasons.map((r) => (
                  <span key={r} className="pa-excluded__reason">
                    {r.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !result && !error && (
        <div className="pa-empty">
          <p className="pa-empty__text">
            Enter an item name above to see real-time eBay pricing data.
          </p>
        </div>
      )}
    </section>
  );
}
