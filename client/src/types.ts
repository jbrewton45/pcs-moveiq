export interface UserPublic {
  id: string;
  email: string;
  displayName: string;
  branchOfService?: string;
  dutyStation?: string;
  preferredMarketplace?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export type MoveType = "CONUS" | "OCONUS" | "JAPAN" | "EUROPE" | "STORAGE_ONLY";

export type IdentificationStatus = "NONE" | "SUGGESTED" | "CONFIRMED" | "EDITED";

export type ComparableSource = "claude" | "openai" | "ebay" | "web" | "mock";

export interface Comparable {
  id: string;
  itemId: string;
  title: string;
  source: ComparableSource;
  url?: string;
  thumbnailUrl?: string;
  price: number;
  soldStatus?: string;
  createdAt: string;
}

export type HousingAssumption = "SMALLER" | "SAME" | "LARGER" | "UNKNOWN";

export type UserGoal =
  | "MAXIMIZE_CASH"
  | "REDUCE_STRESS"
  | "REDUCE_SHIPMENT_BURDEN"
  | "FIT_SMALLER_HOME"
  | "BALANCED";

export type ItemCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "POOR";

export type SizeClass = "SMALL" | "MEDIUM" | "LARGE" | "OVERSIZED";

export type Recommendation =
  | "SELL_NOW"
  | "SELL_SOON"
  | "SHIP"
  | "STORE"
  | "DONATE"
  | "DISCARD"
  | "KEEP";

export type ItemStatus =
  | "UNREVIEWED"
  | "REVIEWED"
  | "LISTED"
  | "SOLD"
  | "DONATED"
  | "STORED"
  | "SHIPPED"
  | "DISCARDED"
  | "KEPT";

export interface Project {
  id: string;
  userId: string;
  projectName: string;
  currentLocation: string;
  destination: string;
  moveType: MoveType;
  planningStartDate: string;
  hardMoveDate: string;
  optionalPackoutDate?: string;
  housingAssumption: HousingAssumption;
  userGoal: UserGoal;
  weightAllowanceLbs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  projectId: string;
  roomName: string;
  roomType: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClarificationQuestion {
  field: string;       // e.g. "lensIncluded", "shutterCount", "majorDamage"
  question: string;    // human-readable question
  inputType: "boolean" | "text" | "select";
  options?: string[];  // for select type
}

export interface Item {
  id: string;
  projectId: string;
  roomId: string;
  itemName: string;
  category: string;
  condition: ItemCondition;
  sizeClass: SizeClass;
  notes?: string;
  weightLbs?: number;
  photoPath?: string;
  sentimentalFlag: boolean;
  keepFlag: boolean;
  willingToSell: boolean;
  recommendation: Recommendation;
  recommendationReason?: string;
  status: ItemStatus;
  identifiedName?: string;
  identifiedCategory?: string;
  identifiedBrand?: string;
  identifiedModel?: string;
  identificationConfidence?: number;
  identificationReasoning?: string;
  identificationStatus: IdentificationStatus;
  priceFastSale?: number;
  priceFairMarket?: number;
  priceReach?: number;
  pricingConfidence?: number;
  pricingReasoning?: string;
  pricingSuggestedChannel?: string;
  pricingSaleSpeedBand?: string;
  pricingLastUpdatedAt?: string;
  pendingClarifications?: string; // JSON-serialized ClarificationQuestion[]
  clarificationAnswers?: string;  // JSON-serialized Record<string, string>
  createdAt: string;
  updatedAt: string;
}

export interface EbayAnalysisResult {
  query: string;
  analysis: {
    canonicalQuery: string;
    marketHealth: "strong" | "moderate" | "weak" | "insufficient";
    confidenceScore: number;
    confidenceLabel: "high" | "medium" | "low" | "insufficient";
    pricingTiers: { fastSale: number; fairMarket: number; maxReach: number } | null;
    recommendedListingStrategy: string;
    summary: string;
  };
  groups: Array<{
    groupKey: string;
    label: string;
    matchCount: number;
    confidenceScore: number;
    priceStats: {
      min: number;
      p25: number;
      median: number;
      p75: number;
      max: number;
      mean: number;
      count: number;
    };
    derivedPricing: { fastSale: number; fairMarket: number; maxReach: number };
    reasoning: string[];
    items: Array<{
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
      classification: {
        listingClass: string;
        relevanceScore: number;
        configTier: string;
        flags: string[];
      };
    }>;
  }>;
  excluded: { count: number; reasons: string[] };
}

export type UrgencyBucket =
  | "SELL_IMMEDIATELY"
  | "SELL_THIS_WEEK"
  | "SELL_SOON"
  | "PLAN_TO_SELL"
  | "LOW_URGENCY"
  | "NOT_WORTH_SELLING";

export interface SellPriorityResult {
  urgency: {
    bucket: UrgencyBucket;
    score: number;
    daysUntilPCS: number | null;
    daysUntilPackout: number | null;
    adjustedDaysToPCS: number | null;
    headline: string;
    reasoning: string[];
  };
  channels: Array<{
    channel: string;
    rank: number;
    reason: string;
    estimatedDaysToSell: string;
    fits: boolean;
  }>;
  pricing: {
    recommendedPrice: number | null;
    pricingStrategy: string;
    originalTiers: { fastSale: number; fairMarket: number; maxReach: number } | null;
  };
  ebayAnalysis: EbayAnalysisResult;
}

export interface ProjectWorkspace {
  project: Project;
  rooms: Room[];
  items: Item[];
  summary: Record<string, number>;
  weight: {
    totalWeight: number;
    roomWeights: Record<string, number>;
    itemsWithWeight: number;
    itemsWithoutWeight: number;
  };
}
