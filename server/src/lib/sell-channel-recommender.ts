import type { SellChannelRecommendation, MarketHealthLevel, SaleSpeedBand } from "../types/sell-priority.types.js";
import type { SizeClass } from "../types/domain.js";

export interface ChannelInput {
  fairMarketPrice: number | null;
  daysUntilPCS: number | null;
  sizeClass?: SizeClass;
  marketHealth: MarketHealthLevel;
  saleSpeedBand: SaleSpeedBand;
  region?: string;
}

// ---------------------------------------------------------------------------
// Internal channel descriptor
// ---------------------------------------------------------------------------

interface ChannelCandidate {
  channel: string;
  estimatedDaysToSell: string;
  minDaysRequired: number;  // minimum daysUntilPCS needed to complete the sale
  score: number;
  fits: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLargeOrOversized(sizeClass: SizeClass | undefined): boolean {
  return sizeClass === "LARGE" || sizeClass === "OVERSIZED";
}

function isShippable(sizeClass: SizeClass | undefined): boolean {
  return sizeClass === "SMALL" || sizeClass === "MEDIUM";
}

// ---------------------------------------------------------------------------
// Per-channel fit and scoring
// ---------------------------------------------------------------------------

function evalFacebookMarketplace(
  price: number,
  days: number | null,
  sizeClass: SizeClass | undefined,
): ChannelCandidate | null {
  const MIN_DAYS = 7;
  const fitsTime = days === null || days >= MIN_DAYS;

  if (price < 30 || price > 500) return null;
  if (!fitsTime) return null;

  let score = 60;
  const parts: string[] = [];

  if (isLargeOrOversized(sizeClass)) {
    score += 20;
    parts.push("local pickup avoids shipping hassle");
  } else {
    parts.push("broad local audience");
  }

  if (price >= 75 && price <= 300) {
    score += 10;
    parts.push("price range performs well locally");
  }

  if (days !== null && days <= 14) {
    score += 10;
    parts.push("quick turnaround fits your timeline");
  }

  return {
    channel: "Facebook Marketplace",
    estimatedDaysToSell: "2-7 days",
    minDaysRequired: MIN_DAYS,
    score,
    fits: fitsTime,
    reason: parts.join("; "),
  };
}

function evalEbay(
  price: number,
  days: number | null,
  sizeClass: SizeClass | undefined,
  marketHealth: MarketHealthLevel,
): ChannelCandidate | null {
  const MIN_DAYS = 14;
  const fitsTime = days === null || days >= MIN_DAYS;

  if (price < 75) return null;
  if (!fitsTime) return null;

  // eBay shipping is impractical for large/oversized
  if (isLargeOrOversized(sizeClass)) return null;

  let score = 55;
  const parts: string[] = [];

  if (price > 300) {
    score += 20;
    parts.push("high-value items attract motivated online buyers");
  } else {
    parts.push("reaches national buyer pool");
  }

  if (marketHealth === "strong") {
    score += 15;
    parts.push("strong market demand on eBay");
  } else if (marketHealth === "moderate") {
    score += 5;
    parts.push("moderate online demand");
  }

  if (isShippable(sizeClass)) {
    score += 10;
    parts.push("item ships easily");
  }

  return {
    channel: "eBay",
    estimatedDaysToSell: "7-14 days",
    minDaysRequired: MIN_DAYS,
    score,
    fits: fitsTime,
    reason: parts.join("; "),
  };
}

function evalOfferUp(
  price: number,
  days: number | null,
  sizeClass: SizeClass | undefined,
): ChannelCandidate | null {
  const MIN_DAYS = 10;
  const fitsTime = days === null || days >= MIN_DAYS;

  if (price < 20 || price > 300) return null;
  if (sizeClass === "OVERSIZED") return null;
  if (!fitsTime) return null;

  let score = 50;
  const parts: string[] = ["local + optional shipping option"];

  if (price >= 20 && price <= 150) {
    score += 10;
    parts.push("sweet spot for OfferUp buyers");
  }

  if (days !== null && days >= 10 && days < 14) {
    score += 5;
    parts.push("fits your timeline");
  }

  return {
    channel: "OfferUp",
    estimatedDaysToSell: "3-10 days",
    minDaysRequired: MIN_DAYS,
    score,
    fits: fitsTime,
    reason: parts.join("; "),
  };
}

function evalBaseYardSale(
  price: number,
  days: number | null,
): ChannelCandidate | null {
  const MIN_DAYS = 1;
  const fitsTime = days === null || days >= MIN_DAYS;

  // Base yard sales are practical for lower-priced items
  if (price > 200) return null;
  if (!fitsTime) return null;

  let score = 45;
  const parts: string[] = [];

  if (price < 75) {
    score += 20;
    parts.push("ideal for low-price quick cash");
  } else {
    parts.push("good for bulk clearance");
  }

  if (days !== null && days <= 7) {
    score += 20;
    parts.push("fastest local option given your timeline");
  }

  parts.push("on-post buyers are motivated");

  return {
    channel: "Base Yard Sale / On-post Sale",
    estimatedDaysToSell: "1-2 days",
    minDaysRequired: MIN_DAYS,
    score,
    fits: fitsTime,
    reason: parts.join("; "),
  };
}

function evalDonate(
  price: number,
  days: number | null,
): ChannelCandidate {
  const parts: string[] = ["immediate — no waiting, no negotiation"];

  if (price > 0) {
    parts.push("claim fair-market value as a tax deduction");
  }

  if (days !== null && days <= 3) {
    parts.push("only viable option given time remaining");
  }

  return {
    channel: "Donate (tax deduction)",
    estimatedDaysToSell: "Immediate",
    minDaysRequired: 0,
    score: 20,
    fits: true,
    reason: parts.join("; "),
  };
}

// ---------------------------------------------------------------------------
// Special-rule score adjustments
// ---------------------------------------------------------------------------

function applySpecialRules(
  candidates: ChannelCandidate[],
  price: number,
  days: number | null,
  sizeClass: SizeClass | undefined,
): void {
  const large = isLargeOrOversized(sizeClass);
  const shortTimeline = days !== null && days <= 7;
  const highValue = price > 300;

  for (const c of candidates) {
    if (large) {
      if (c.channel === "Facebook Marketplace" || c.channel === "Base Yard Sale / On-post Sale") {
        c.score += 15;
      }
      if (c.channel === "eBay") {
        // Already excluded for large/oversized in evalEbay, but guard anyway
        c.score -= 20;
      }
    }

    if (highValue) {
      if (c.channel === "eBay") {
        c.score += 15;
      }
    }

    if (shortTimeline) {
      if (c.channel === "Base Yard Sale / On-post Sale") {
        c.score += 25;
      }
      if (c.channel === "Facebook Marketplace") {
        c.score += 15;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Region-aware score adjustments
// ---------------------------------------------------------------------------

function applyRegionRules(
  candidates: ChannelCandidate[],
  region: string | undefined,
  sizeClass: SizeClass | undefined,
): void {
  if (!region || region === "conus") return;

  const isRemote = region === "guam" || region === "hawaii" || region === "alaska" || region === "oconus";
  const large = isLargeOrOversized(sizeClass);

  for (const c of candidates) {
    if (isRemote) {
      // Remote locations: eBay shipping is expensive for large items
      if (c.channel === "eBay" && large) {
        c.score -= 25;
        c.reason += "; shipping from remote location is costly for large items";
      }

      // Base yard sales and local FB groups are more important at remote posts
      if (c.channel === "Base Yard Sale / On-post Sale") {
        c.score += 15;
        c.reason += "; on-post buyers are the primary market at remote locations";
      }

      if (c.channel === "Facebook Marketplace") {
        c.score += 10;
        c.reason += "; local Facebook groups are highly active at military installations";
      }

      // OfferUp has limited reach at remote locations
      if (c.channel === "OfferUp" && (region === "guam" || region === "oconus")) {
        c.score -= 15;
        c.reason += "; limited OfferUp presence at this location";
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recommend the best sell channels for a PCS item.
 *
 * Returns 1-4 channels sorted by rank (1 = best fit). Each channel receives a
 * unique rank. The function is pure and performs no I/O.
 */
export function recommendChannels(input: ChannelInput): SellChannelRecommendation[] {
  const { fairMarketPrice, daysUntilPCS, sizeClass, marketHealth, saleSpeedBand } = input;

  const price = fairMarketPrice ?? 0;

  // Edge case: value too low to bother selling
  if (price <= 15) {
    return [
      {
        channel: "Donate (tax deduction)",
        rank: 1,
        reason: "Value too low to justify listing effort; donate and take the tax deduction",
        estimatedDaysToSell: "Immediate",
        fits: true,
      },
    ];
  }

  // Build candidate list from channels that fit
  const candidates: ChannelCandidate[] = [];

  const fb = evalFacebookMarketplace(price, daysUntilPCS, sizeClass);
  if (fb) candidates.push(fb);

  const ebay = evalEbay(price, daysUntilPCS, sizeClass, marketHealth);
  if (ebay) candidates.push(ebay);

  const offerUp = evalOfferUp(price, daysUntilPCS, sizeClass);
  if (offerUp) candidates.push(offerUp);

  const baseYard = evalBaseYardSale(price, daysUntilPCS);
  if (baseYard) candidates.push(baseYard);

  // Apply cross-cutting score adjustments
  applySpecialRules(candidates, price, daysUntilPCS, sizeClass);

  // Apply region-aware adjustments
  applyRegionRules(candidates, input.region, sizeClass);

  // Boost/penalise based on market health and sale speed band globally
  for (const c of candidates) {
    if (saleSpeedBand === "fast" && c.channel !== "Donate (tax deduction)") {
      c.score += 5;
    }
    if (saleSpeedBand === "slow" || marketHealth === "insufficient" || marketHealth === "weak") {
      if (c.channel === "eBay") c.score -= 10;
    }
  }

  // If no channel qualified (e.g. everything timed out), fall through to donate
  if (candidates.length === 0) {
    const donate = evalDonate(price, daysUntilPCS);
    candidates.push(donate);
  }

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  // Keep 2-4 channels; always include at least one
  const MAX_CHANNELS = 4;
  const selected = candidates.slice(0, MAX_CHANNELS);

  // If donate is not present and the list is under 4, consider appending it as
  // a fallback only when there is very little time left or price is marginal
  const hasDonate = selected.some(c => c.channel === "Donate (tax deduction)");
  if (!hasDonate && selected.length < MAX_CHANNELS && (daysUntilPCS !== null && daysUntilPCS <= 14 || price < 50)) {
    const donate = evalDonate(price, daysUntilPCS);
    selected.push(donate);
  }

  // Assign unique ranks (1-based, sorted by score desc)
  return selected.map((c, idx) => ({
    channel: c.channel,
    rank: idx + 1,
    reason: c.reason,
    estimatedDaysToSell: c.estimatedDaysToSell,
    fits: c.fits,
  }));
}
