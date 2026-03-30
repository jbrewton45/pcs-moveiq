import type { EbayAnalysisResponse } from "./ebay-analysis.types.js";
import type { ItemCondition, SizeClass, UserGoal } from "./domain.js";

// --- Request ---

export interface SellPriorityRequest {
  query: string;
  limit?: number;
  pcsDate?: string;       // ISO date of hard move date
  packoutDate?: string;   // ISO date of packout if known
  condition?: ItemCondition;
  sizeClass?: SizeClass;
  userGoal?: UserGoal;
  weightLbs?: number;
  sentimentalFlag?: boolean;
  region?: string; // "guam" | "hawaii" | "alaska" | "oconus" | undefined (CONUS default)
}

// --- Urgency buckets ---

export type UrgencyBucket =
  | "SELL_IMMEDIATELY"
  | "SELL_THIS_WEEK"
  | "SELL_SOON"
  | "PLAN_TO_SELL"
  | "LOW_URGENCY"
  | "NOT_WORTH_SELLING";

// --- Channel recommendation ---

export interface SellChannelRecommendation {
  channel: string;
  rank: number;
  reason: string;
  estimatedDaysToSell: string;
  fits: boolean;  // true if est. sale time fits before PCS
}

// --- Urgency scoring internals ---

export type MarketHealthLevel = "strong" | "moderate" | "weak" | "insufficient";
export type SaleSpeedBand = "fast" | "moderate" | "slow" | "uncertain";

export interface UrgencyInput {
  daysUntilPCS: number | null;
  daysUntilPackout: number | null;
  fairMarketPrice: number | null;
  fastSalePrice: number | null;
  marketHealth: MarketHealthLevel;
  confidenceScore: number;
  condition?: ItemCondition;
  sizeClass?: SizeClass;
  userGoal?: UserGoal;
  weightLbs?: number;
  sentimentalFlag?: boolean;
  region?: string;
}

export interface UrgencyOutput {
  bucket: UrgencyBucket;
  score: number;           // 0-100
  reasoning: string[];
  recommendedPriceTier: "fastSale" | "fairMarket" | "maxReach";
  adjustedDeadline: number | null; // effective deadline after origin shift
}

export interface SaleSpeedEstimate {
  band: SaleSpeedBand;
  estimatedDays: string;
}

// --- Full response ---

export interface SellPriorityResponse {
  urgency: {
    bucket: UrgencyBucket;
    score: number;
    daysUntilPCS: number | null;
    daysUntilPackout: number | null;
    adjustedDaysToPCS: number | null; // effective days after origin adjustment
    headline: string;
    reasoning: string[];
  };

  channels: SellChannelRecommendation[];

  pricing: {
    recommendedPrice: number | null;
    pricingStrategy: string;
    originalTiers: { fastSale: number; fairMarket: number; maxReach: number } | null;
  };

  ebayAnalysis: EbayAnalysisResponse;
}
