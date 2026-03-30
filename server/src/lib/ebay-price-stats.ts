import type { PriceStats, PricingTiers } from "../types/ebay-analysis.types.js";

/**
 * Compute price statistics from an array of prices.
 * Handles empty arrays and single-element arrays safely.
 */
export function computePriceStats(prices: number[]): PriceStats | null {
  if (prices.length === 0) return null;

  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;

  return {
    min: sorted[0],
    max: sorted[n - 1],
    median: percentile(sorted, 50),
    p25: percentile(sorted, 25),
    p75: percentile(sorted, 75),
    mean: Math.round(sorted.reduce((s, v) => s + v, 0) / n),
    count: n,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower));
}

/**
 * Remove outlier prices using IQR method.
 * Returns filtered prices (excluding extreme outliers).
 */
export function removeOutliers(prices: number[], multiplier = 1.5): number[] {
  if (prices.length < 4) return prices; // not enough data for IQR

  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;

  if (iqr === 0) return prices; // all prices are the same or very close

  const lower = q1 - multiplier * iqr;
  const upper = q3 + multiplier * iqr;

  return sorted.filter(p => p >= lower && p <= upper);
}

/**
 * Derive pricing tiers from price statistics.
 *
 * fastSale: aggressive lower price for quick sale (p25 or slightly below)
 * fairMarket: balanced mid-market price (median)
 * maxReach: optimistic but defensible upper price (p75)
 */
export function derivePricingTiers(stats: PriceStats): PricingTiers {
  return {
    fastSale: Math.round(stats.p25),
    fairMarket: Math.round(stats.median),
    maxReach: Math.round(stats.p75),
  };
}

/**
 * Compute confidence score for a price group.
 *
 * Based on:
 * - Sample count (more data = more confidence)
 * - Price spread (tight spread = more confidence)
 * - Consistency (low variance relative to median)
 */
export function computeGroupConfidence(stats: PriceStats, totalFetched: number, excludedCount: number): number {
  let score = 0;

  // Sample count contribution (0-0.4)
  if (stats.count >= 10) score += 0.4;
  else if (stats.count >= 5) score += 0.3;
  else if (stats.count >= 3) score += 0.2;
  else score += 0.1;

  // Price spread tightness (0-0.3)
  // coefficient of variation: std/mean
  if (stats.median > 0) {
    const spread = (stats.p75 - stats.p25) / stats.median;
    if (spread < 0.15) score += 0.3;
    else if (spread < 0.3) score += 0.2;
    else if (spread < 0.5) score += 0.1;
    // wider spread = 0 bonus
  }

  // Proportion of usable results (0-0.2)
  if (totalFetched > 0) {
    const usableRatio = stats.count / totalFetched;
    score += Math.min(usableRatio * 0.3, 0.2);
  }

  // Noise penalty: if most results were excluded, reduce confidence (0-0.1)
  if (totalFetched > 0) {
    const excludedRatio = excludedCount / totalFetched;
    if (excludedRatio < 0.3) score += 0.1;
    else if (excludedRatio < 0.5) score += 0.05;
  }

  return Math.round(Math.min(Math.max(score, 0.05), 0.99) * 100) / 100;
}

/**
 * Derive a confidence label from a numeric score.
 */
export function confidenceLabel(score: number): "high" | "medium" | "low" | "insufficient" {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  if (score >= 0.2) return "low";
  return "insufficient";
}

/**
 * Derive market health from comparable count and spread.
 */
export function marketHealth(
  coreMatchCount: number,
  totalUsable: number,
): "strong" | "moderate" | "weak" | "insufficient" {
  if (coreMatchCount >= 8) return "strong";
  if (coreMatchCount >= 4) return "moderate";
  if (totalUsable >= 3) return "weak";
  return "insufficient";
}

/**
 * Generate a recommended listing strategy based on price and market health.
 */
export function listingStrategy(
  health: "strong" | "moderate" | "weak" | "insufficient",
  fairMarket: number,
): string {
  if (health === "insufficient") {
    return "Limited market data — research additional sources before listing.";
  }
  if (health === "weak") {
    return "Low comparable volume — start on Facebook Marketplace at fair market, lower by 10% after 7 days if no interest.";
  }

  const channel = fairMarket > 300
    ? "Facebook Marketplace or eBay"
    : fairMarket > 75
    ? "Facebook Marketplace or OfferUp"
    : "Base Yard Sale, Nextdoor, or OfferUp";

  const speed = health === "strong"
    ? "List on " + channel + " first — strong demand, expect interest within a few days."
    : "List on " + channel + " — moderate demand, allow 1-2 weeks for a fair-market sale.";

  return speed;
}
