import { searchEbayListings } from "./ebay-search.service.js";
import { normalizeQuery } from "../lib/ebay-title-parser.js";
import { classifyListing, groupAndPriceListings } from "../lib/ebay-comparable-classifier.js";
import { confidenceLabel, marketHealth, listingStrategy } from "../lib/ebay-price-stats.js";
import type { EbayAnalysisResponse } from "../types/ebay-analysis.types.js";

export async function analyzeEbayPricing(
  query: string,
  limit = 50,
): Promise<EbayAnalysisResponse | null> {
  const normalizedQ = normalizeQuery(query);

  // Fetch listings (cap at 50 for analysis quality)
  const clampedLimit = Math.min(Math.max(limit, 10), 50);
  const searchResult = await searchEbayListings(normalizedQ, clampedLimit);

  if (!searchResult) {
    return null; // eBay unavailable
  }

  const totalFetched = searchResult.results.length;

  // Classify all listings
  const analyzed = searchResult.results
    .filter(r => r.price !== null && r.price > 0)
    .map(r => classifyListing(r, normalizedQ));

  // Group and price
  const { groups, excluded } = groupAndPriceListings(analyzed, totalFetched);

  // Pick the primary group for top-level pricing (prefer "base", then "base_plus", then largest)
  const primaryGroup =
    groups.find(g => g.groupKey === "base") ??
    groups.find(g => g.groupKey === "base_plus") ??
    (groups.length > 0
      ? groups.reduce((a, b) => (a.matchCount > b.matchCount ? a : b))
      : null);

  // Compute top-level metrics
  const coreMatchCount = groups
    .filter(g => g.groupKey === "base" || g.groupKey === "base_plus")
    .reduce((sum, g) => sum + g.matchCount, 0);

  const totalUsable = groups.reduce((sum, g) => sum + g.matchCount, 0);
  const health = marketHealth(coreMatchCount, totalUsable);

  const topConfidence = primaryGroup?.confidenceScore ?? 0.05;
  const topLabel = confidenceLabel(topConfidence);

  const pricingTiers = primaryGroup?.derivedPricing ?? null;

  const strategy = pricingTiers
    ? listingStrategy(health, pricingTiers.fairMarket)
    : "Insufficient data to recommend a listing strategy.";

  // Build summary
  const summaryParts: string[] = [];
  if (health === "strong" || health === "moderate") {
    summaryParts.push(
      `${health === "strong" ? "Strong" : "Moderate"} market with ${coreMatchCount} core comparable${coreMatchCount > 1 ? "s" : ""}.`,
    );
  } else if (health === "weak") {
    summaryParts.push(
      `Limited comparable data (${totalUsable} usable listing${totalUsable > 1 ? "s" : ""}).`,
    );
  } else {
    summaryParts.push("Insufficient comparable data for reliable pricing.");
  }

  if (excluded.count > 0) {
    summaryParts.push(
      `${excluded.count} listing${excluded.count > 1 ? "s" : ""} excluded (${excluded.reasons.slice(0, 3).join(", ")}).`,
    );
  }

  if (groups.length > 1) {
    const bundleGroup = groups.find(g => g.groupKey === "bundle");
    if (bundleGroup && primaryGroup && primaryGroup.groupKey !== "bundle") {
      summaryParts.push(
        `Bundle listings (${bundleGroup.matchCount}) priced separately from base unit estimates.`,
      );
    }
  }

  return {
    query,
    analysis: {
      canonicalQuery: normalizedQ,
      marketHealth: health,
      confidenceScore: topConfidence,
      confidenceLabel: topLabel,
      pricingTiers,
      recommendedListingStrategy: strategy,
      summary: summaryParts.join(" "),
    },
    groups,
    excluded,
  };
}
