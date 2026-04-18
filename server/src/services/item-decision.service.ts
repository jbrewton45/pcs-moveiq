/**
 * item-decision.service.ts — Decision engine with confidence-weighted scoring.
 *
 * Key changes from v1:
 * - REMOVED: static CATEGORY_DEMAND map + demandBand()
 * - ADDED: pricingConfidence from listing count + price spread
 * - ADDED: dynamic demand score from listing count + price stability
 * - CHANGED: urgencyScore weighted by confidence (LOW → dampened, HIGH → boosted)
 * - CHANGED: platform recommendation is urgency-driven, not value-driven
 * - ADDED: confidenceLevel + pricingConfidence in response
 */

import type { ItemCondition, SizeClass } from "../types/domain.js";

// ── Input / Output types ────────────────────────────────────────────────────

export interface DecisionInput {
  itemName: string;
  category: string;
  condition: ItemCondition;
  sizeClass: SizeClass;
  weightLbs?: number;
  priceFairMarket?: number;
  priceFastSale?: number;
  ebayAvgPrice?: number;
  ebayMedianPrice?: number;
  ebayLowPrice?: number;
  ebayHighPrice?: number;
  ebayListingCount?: number;
  pcsDate?: string;
  keepFlag?: boolean;
  sentimentalFlag?: boolean;
  willingToSell?: boolean;
}

export type RecommendedAction =
  | "SELL_NOW"
  | "SELL_LATER"
  | "SHIP"
  | "STORE"
  | "DONATE"
  | "DISCARD";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface DecisionBreakdown {
  valueScore: number;
  sizeScore: number;
  urgencyScore: number;
  conditionScore: number;
  demandScore: number;
  confidenceMultiplier: number;
}

export interface DecisionOutput {
  urgencyScore: number;
  recommendedAction: RecommendedAction;
  recommendedPlatform: string | null;
  rationale: string;
  breakdown: DecisionBreakdown;
  pricingConfidence: number;
  confidenceLevel: ConfidenceLevel;
}

// ── Pricing confidence (NEW — replaces implicit trust in price data) ────────

function computePricingConfidence(input: DecisionInput): { score: number; level: ConfidenceLevel } {
  const n = input.ebayListingCount ?? 0;
  const low = input.ebayLowPrice ?? 0;
  const high = input.ebayHighPrice ?? 0;
  const median = input.ebayMedianPrice ?? 0;
  const hasEbayData = n > 0 && median > 0;
  const hasAiEstimate = (input.priceFairMarket ?? 0) > 0;

  if (!hasEbayData && !hasAiEstimate) {
    return { score: 0, level: "LOW" };
  }

  // Base score from data source quality
  let score = 0;
  if (hasEbayData) {
    // Listing count: more comps = more confidence
    if (n >= 10) score += 0.4;
    else if (n >= 5) score += 0.3;
    else if (n >= 3) score += 0.2;
    else score += 0.1;

    // Price stability: tighter spread = more confidence
    if (high > 0 && low > 0 && median > 0) {
      const spread = (high - low) / median;
      if (spread <= 0.3) score += 0.4;
      else if (spread <= 0.6) score += 0.25;
      else if (spread <= 1.0) score += 0.1;
      // spread > 1.0 = volatile market, no bonus
    }

    // eBay + AI agreement bonus
    if (hasAiEstimate && median > 0) {
      const ratio = input.priceFairMarket! / median;
      if (ratio >= 0.7 && ratio <= 1.3) score += 0.15;
    }
  } else {
    // AI estimate only — moderate base
    score = 0.25;
  }

  score = Math.max(0, Math.min(1, score));
  const level: ConfidenceLevel = score >= 0.6 ? "HIGH" : score >= 0.3 ? "MEDIUM" : "LOW";
  return { score: Math.round(score * 100) / 100, level };
}

// ── Dynamic demand score (REPLACES static CATEGORY_DEMAND) ──────────────────

function dynamicDemandScore(input: DecisionInput): number {
  const n = input.ebayListingCount ?? 0;
  const low = input.ebayLowPrice ?? 0;
  const high = input.ebayHighPrice ?? 0;
  const median = input.ebayMedianPrice ?? 0;

  if (n === 0 || median <= 0) {
    // No market data — return a conservative middle value
    return 4;
  }

  let score = 0;

  // Listing volume as demand proxy: more sold = more demand
  if (n >= 20) score += 6;
  else if (n >= 10) score += 5;
  else if (n >= 5) score += 3;
  else score += 1;

  // Price stability as demand proxy: stable prices = consistent demand
  if (high > 0 && low > 0) {
    const spread = (high - low) / median;
    if (spread <= 0.3) score += 4;
    else if (spread <= 0.6) score += 2;
    else score += 1;
  }

  return Math.min(10, score);
}

// ── Bands ───────────────────────────────────────────────────────────────────

function valueBand(valueUsd: number): number {
  if (valueUsd >= 500) return 30;
  if (valueUsd >= 100) return 22;
  if (valueUsd >= 50) return 14;
  if (valueUsd >= 30) return 8;
  if (valueUsd >= 10) return 3;
  return 0;
}

function sizeBand(sizeClass: SizeClass, weightLbs?: number): number {
  let base = 0;
  switch (sizeClass) {
    case "OVERSIZED": base = 20; break;
    case "LARGE": base = 14; break;
    case "MEDIUM": base = 6; break;
    case "SMALL": base = 1; break;
  }
  if (weightLbs != null) {
    if (weightLbs >= 50) base += 5;
    else if (weightLbs >= 20) base += 3;
  }
  return Math.min(20, base);
}

function urgencyBand(pcsDateIso?: string): number {
  if (!pcsDateIso) return 0;
  const pcsDate = Date.parse(pcsDateIso);
  if (Number.isNaN(pcsDate)) return 0;
  const days = Math.floor((pcsDate - Date.now()) / 86_400_000);
  if (days <= 14) return 25;
  if (days <= 30) return 18;
  if (days <= 60) return 10;
  if (days <= 90) return 5;
  return 0;
}

function conditionBand(condition: ItemCondition): number {
  switch (condition) {
    case "POOR": return 15;
    case "FAIR": return 8;
    case "GOOD": return 2;
    case "LIKE_NEW":
    case "NEW": return 0;
    default: return 0;
  }
}

// ── Confidence multiplier (NEW — modulates the overall score) ───────────────

function confidenceMultiplier(level: ConfidenceLevel): number {
  switch (level) {
    case "HIGH": return 1.15;
    case "MEDIUM": return 1.0;
    case "LOW": return 0.8;
  }
}

// ── Best price resolution ───────────────────────────────────────────────────

function bestPrice(input: DecisionInput): number {
  if (input.ebayMedianPrice != null && input.ebayMedianPrice > 0) return input.ebayMedianPrice;
  if (input.ebayAvgPrice != null && input.ebayAvgPrice > 0) return input.ebayAvgPrice;
  if (input.priceFairMarket != null && input.priceFairMarket > 0) return input.priceFairMarket;
  if (input.priceFastSale != null && input.priceFastSale > 0) return input.priceFastSale;
  return 0;
}

function daysUntilPCS(pcsDateIso?: string): number | null {
  if (!pcsDateIso) return null;
  const d = Date.parse(pcsDateIso);
  if (Number.isNaN(d)) return null;
  return Math.floor((d - Date.now()) / 86_400_000);
}

// ── Action determination ────────────────────────────────────────────────────

function determineAction(input: DecisionInput, value: number, days: number | null): RecommendedAction {
  if (input.keepFlag || input.sentimentalFlag) return "SHIP";

  if (input.condition === "POOR" && value < 20) return "DISCARD";
  if (input.condition === "POOR") return "DONATE";

  const isLarge = input.sizeClass === "LARGE" || input.sizeClass === "OVERSIZED";
  if (isLarge && value < 30) return "DONATE";

  if (value >= 100 && days != null && days <= 30) return "SELL_NOW";
  if (value >= 50 && days != null && days <= 60) return "SELL_NOW";
  if (value >= 50) return "SELL_LATER";
  if (value >= 30 && input.willingToSell) return "SELL_LATER";

  if (isLarge) return "SHIP";
  return "SHIP";
}

// ── Platform recommendation (CHANGED — urgency-driven) ──────────────────────

function recommendPlatform(
  action: RecommendedAction,
  value: number,
  urgency: number,
  confidenceLvl: ConfidenceLevel,
): string | null {
  if (action === "DISCARD") return null;
  if (action === "SHIP" || action === "STORE") return null;
  if (action === "DONATE") return "Thrift store / Goodwill";

  // High urgency → prioritize speed over maximum value
  if (urgency >= 60) {
    if (value >= 100) return "Facebook Marketplace (fast local sale)";
    return "Base Yard Sale / Facebook Groups (fastest turnover)";
  }

  // Medium urgency → balanced approach
  if (urgency >= 30) {
    if (value >= 200 && confidenceLvl === "HIGH") return "eBay + Facebook Marketplace (dual-list for best result)";
    if (value >= 100) return "Facebook Marketplace (good speed/value balance)";
    return "Facebook Marketplace or Base Yard Sale";
  }

  // Low urgency → maximize value
  if (value >= 200) return "eBay (maximize value with time to wait)";
  if (value >= 100) return "eBay or Facebook Marketplace";
  if (value >= 50) return "Facebook Marketplace";
  return "Base Yard Sale / Facebook Groups";
}

// ── Rationale builder ───────────────────────────────────────────────────────

function currency(usd: number): string {
  return usd >= 1 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`;
}

function buildRationale(
  input: DecisionInput,
  action: RecommendedAction,
  value: number,
  days: number | null,
  platform: string | null,
  conf: { score: number; level: ConfidenceLevel },
): string {
  if (input.keepFlag) return "Marked as keep — ship with household goods.";
  if (input.sentimentalFlag) return "Sentimental item — keep and ship.";

  if (action === "DISCARD") {
    return `Poor condition and only ${currency(value)} value — not worth selling or donating. Consider discarding.`;
  }

  if (action === "DONATE") {
    if (input.condition === "POOR") return "Poor condition — donate rather than sell.";
    return `Bulky item worth only ${currency(value)} — donate and save the shipping weight.`;
  }

  const parts: string[] = [];
  const priceSource = input.ebayMedianPrice ? "eBay sold data" : "AI estimate";
  const confNote = conf.level === "LOW" ? " (low confidence — limited market data)" : "";

  if (action === "SELL_NOW") {
    parts.push(`Worth ${currency(value)} based on ${priceSource}${confNote}.`);
    if (days != null && days <= 14) parts.push(`PCS in ${days} days — sell immediately.`);
    else if (days != null) parts.push(`PCS in ${days} days — list now for best return.`);
    if (platform) parts.push(`Try ${platform}.`);
    return parts.join(" ");
  }

  if (action === "SELL_LATER") {
    parts.push(`Worth ${currency(value)} based on ${priceSource}${confNote}.`);
    if (days != null) parts.push(`You have ${days} days — list when ready.`);
    else parts.push("No PCS date set — sell when convenient.");
    if (platform) parts.push(`Try ${platform}.`);
    return parts.join(" ");
  }

  if (value > 0) return `Worth ${currency(value)} but better to keep and ship.`;
  return "Everyday item — pack and ship with household goods.";
}

// ── Main scoring function ───────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function computeDecision(input: DecisionInput): DecisionOutput {
  const value = bestPrice(input);
  const days = daysUntilPCS(input.pcsDate);

  // Pricing confidence (NEW)
  const conf = computePricingConfidence(input);
  const confMult = confidenceMultiplier(conf.level);

  // Dynamic demand (REPLACES static category map)
  const demand = dynamicDemandScore(input);

  const breakdown: DecisionBreakdown = {
    valueScore: valueBand(value),
    sizeScore: sizeBand(input.sizeClass, input.weightLbs),
    urgencyScore: urgencyBand(input.pcsDate),
    conditionScore: conditionBand(input.condition),
    demandScore: demand,
    confidenceMultiplier: confMult,
  };

  // Apply confidence weighting: LOW confidence dampens score, HIGH boosts it
  let raw = (breakdown.valueScore + breakdown.sizeScore + breakdown.urgencyScore
    + breakdown.conditionScore + breakdown.demandScore) * confMult;

  if (input.keepFlag) raw *= 0.1;
  else if (input.sentimentalFlag) raw *= 0.3;

  const urgencyScore = clamp(Math.round(raw), 0, 100);
  const recommendedAction = determineAction(input, value, days);
  const recommendedPlatform = recommendPlatform(recommendedAction, value, urgencyScore, conf.level);
  const rationale = buildRationale(input, recommendedAction, value, days, recommendedPlatform, conf);

  return {
    urgencyScore,
    recommendedAction,
    recommendedPlatform,
    rationale,
    breakdown,
    pricingConfidence: conf.score,
    confidenceLevel: conf.level,
  };
}
