export interface EbayAnalysisResponse {
  query: string;
  analysis: PricingAnalysis;
  groups: ComparableGroup[];
  excluded: ExclusionSummary;
}

export interface PricingAnalysis {
  canonicalQuery: string;
  marketHealth: "strong" | "moderate" | "weak" | "insufficient";
  confidenceScore: number;
  confidenceLabel: "high" | "medium" | "low" | "insufficient";
  pricingTiers: PricingTiers | null;
  recommendedListingStrategy: string;
  summary: string;
}

export interface PricingTiers {
  fastSale: number;
  fairMarket: number;
  maxReach: number;
}

export interface PriceStats {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
  count: number;
}

export interface ComparableGroup {
  groupKey: string;
  label: string;
  matchCount: number;
  confidenceScore: number;
  priceStats: PriceStats;
  derivedPricing: PricingTiers;
  reasoning: string[];
  items: AnalyzedListing[];
}

export interface AnalyzedListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  condition: string;
  itemWebUrl: string | null;
  imageUrl: string | null;
  sellerUsername: string | null;
  shippingCost: number | null;
  itemLocation: string | null;
  classification: ListingClassification;
}

export type ListingClass =
  | "core_match"
  | "core_with_accessory"
  | "bundle"
  | "accessory_only"
  | "parts_repair"
  | "wrong_variant"
  | "noise";

export interface ListingClassification {
  listingClass: ListingClass;
  relevanceScore: number;    // 0-1, how relevant to the query
  configTier: "base" | "base_plus" | "bundle" | "full_kit";
  flags: string[];           // e.g., ["bundle_detected", "accessory_only", "parts_repair"]
}

export interface ExclusionSummary {
  count: number;
  reasons: string[];
}
