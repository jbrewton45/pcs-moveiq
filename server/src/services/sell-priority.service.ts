import { analyzeEbayPricing } from "./ebay-pricing-analysis.service.js";
import { computeUrgencyScore, estimateSaleSpeed } from "../lib/pcs-urgency-score.js";
import { recommendChannels } from "../lib/sell-channel-recommender.js";
import type {
  SellPriorityRequest,
  SellPriorityResponse,
  UrgencyBucket,
  MarketHealthLevel,
} from "../types/sell-priority.types.js";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function daysUntil(isoDate: string | undefined): number | null {
  if (!isoDate) return null;
  const target = new Date(isoDate);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Headline builder
// ---------------------------------------------------------------------------

const BUCKET_DISPLAY: Record<UrgencyBucket, string> = {
  SELL_IMMEDIATELY: "Sell Immediately",
  SELL_THIS_WEEK: "Sell This Week",
  SELL_SOON: "Sell Soon",
  PLAN_TO_SELL: "Plan to Sell",
  LOW_URGENCY: "Low Urgency",
  NOT_WORTH_SELLING: "Consider Donating",
};

function buildHeadline(
  bucket: UrgencyBucket,
  recommendedPrice: number | null,
  daysUntilPCS: number | null,
  topChannel: string | null,
): string {
  const bucketLabel = BUCKET_DISPLAY[bucket];
  const priceStr = recommendedPrice !== null ? `$${recommendedPrice}` : null;
  const daysStr = daysUntilPCS !== null ? `${daysUntilPCS} day${daysUntilPCS === 1 ? "" : "s"} until PCS` : null;

  if (bucket === "NOT_WORTH_SELLING") {
    return daysStr
      ? `Consider donating — estimated value too low to justify selling with ${daysStr}`
      : "Consider donating — estimated value too low to justify selling effort";
  }

  const parts: string[] = [];

  if (priceStr && topChannel) {
    parts.push(`List at ${priceStr} on ${topChannel}`);
  } else if (priceStr) {
    parts.push(`List at ${priceStr}`);
  } else {
    parts.push(bucketLabel);
  }

  if (daysStr) {
    parts.push(daysStr);
  }

  return parts.join(" — ");
}

// ---------------------------------------------------------------------------
// Pricing strategy builder
// ---------------------------------------------------------------------------

function buildPricingStrategy(
  recommendedPriceTier: "fastSale" | "fairMarket" | "maxReach",
  tiers: { fastSale: number; fairMarket: number; maxReach: number } | null,
  daysUntilPCS: number | null,
): { recommendedPrice: number | null; pricingStrategy: string } {
  if (!tiers) {
    return {
      recommendedPrice: null,
      pricingStrategy: "Insufficient comparable data to recommend a price.",
    };
  }

  const price = tiers[recommendedPriceTier];

  if (recommendedPriceTier === "fastSale") {
    const timeNote = daysUntilPCS !== null
      ? `only ${daysUntilPCS} days left`
      : "quick-sale strategy";
    return {
      recommendedPrice: price,
      pricingStrategy: `Price at fast-sale ($${price}) — ${timeNote}. Reduce by 10-15% if unsold after 3 days.`,
    };
  }

  if (recommendedPriceTier === "fairMarket") {
    return {
      recommendedPrice: price,
      pricingStrategy: `Start at fair market ($${price}). Drop to fast-sale ($${tiers.fastSale}) if unsold after 5-7 days.`,
    };
  }

  // maxReach
  return {
    recommendedPrice: price,
    pricingStrategy: `List at max reach ($${price}) — you have time. Drop to fair market ($${tiers.fairMarket}) after 7-10 days if needed.`,
  };
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function computeSellPriority(
  req: SellPriorityRequest,
): Promise<SellPriorityResponse | null> {
  // 1. Run existing eBay analysis
  const ebayAnalysis = await analyzeEbayPricing(req.query, req.limit ?? 50);
  if (!ebayAnalysis) return null;

  const { analysis, groups } = ebayAnalysis;

  // 2. Compute days until PCS/packout
  const daysUntilPCS = daysUntil(req.pcsDate);
  const daysUntilPackout = daysUntil(req.packoutDate);

  // 3. Derive sale speed proxy
  const tiers = analysis.pricingTiers;
  const priceSpreadRatio = tiers && tiers.fairMarket > 0
    ? (tiers.maxReach - tiers.fastSale) / tiers.fairMarket
    : 1;
  const saleSpeed = estimateSaleSpeed(
    analysis.marketHealth as MarketHealthLevel,
    priceSpreadRatio,
  );

  // 4. Compute urgency score
  const urgencyResult = computeUrgencyScore({
    daysUntilPCS,
    daysUntilPackout,
    fairMarketPrice: tiers?.fairMarket ?? null,
    fastSalePrice: tiers?.fastSale ?? null,
    marketHealth: analysis.marketHealth as MarketHealthLevel,
    confidenceScore: analysis.confidenceScore,
    condition: req.condition,
    sizeClass: req.sizeClass,
    userGoal: req.userGoal,
    weightLbs: req.weightLbs,
    sentimentalFlag: req.sentimentalFlag,
    region: req.region,
  });

  // 5. Recommend channels
  const channels = recommendChannels({
    fairMarketPrice: tiers?.fairMarket ?? null,
    daysUntilPCS,
    sizeClass: req.sizeClass,
    marketHealth: analysis.marketHealth as MarketHealthLevel,
    saleSpeedBand: saleSpeed.band,
    region: req.region,
  });

  // 6. Build pricing strategy
  const { recommendedPrice, pricingStrategy } = buildPricingStrategy(
    urgencyResult.recommendedPriceTier,
    tiers,
    daysUntilPCS,
  );

  // 7. Build headline
  const topChannel = channels.length > 0 ? channels[0].channel : null;
  const headline = buildHeadline(
    urgencyResult.bucket,
    recommendedPrice,
    daysUntilPCS,
    topChannel,
  );

  return {
    urgency: {
      bucket: urgencyResult.bucket,
      score: urgencyResult.score,
      daysUntilPCS,
      daysUntilPackout,
      adjustedDaysToPCS: urgencyResult.adjustedDeadline,
      headline,
      reasoning: urgencyResult.reasoning,
    },
    channels,
    pricing: {
      recommendedPrice,
      pricingStrategy,
      originalTiers: tiers,
    },
    ebayAnalysis,
  };
}
