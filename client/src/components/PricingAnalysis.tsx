import { useState } from "react";
import { api } from "../api";
import type { EbayAnalysisResult } from "../types";

function healthLabel(health: string): string {
  switch (health) {
    case "strong": return "Strong market";
    case "moderate": return "Moderate market";
    case "weak": return "Weak market";
    case "insufficient": return "Insufficient data";
    default: return health;
  }
}

function formatPrice(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

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

interface PricingAnalysisProps {
  onBack: () => void;
}

export function PricingAnalysis({ onBack }: PricingAnalysisProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EbayAnalysisResult | null>(null);

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await api.analyzeEbayPricing(trimmed);
      setResult(data);
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
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </form>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading && (
        <div className="pa-loading">
          <div className="pa-loading__bar" />
          <p className="pa-loading__text">Fetching eBay listings and analyzing pricing&hellip;</p>
        </div>
      )}

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

            {result.analysis.recommendedListingStrategy && (
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
