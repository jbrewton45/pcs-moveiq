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

export type IdentificationQuality = "STRONG" | "MEDIUM" | "WEAK";

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
  | "KEEP"
  | "COMPLETE"; // Phase 10: terminal state after an item is sold

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

// ── Room visualization types (aligned with server RoomScanPayloadSchema) ─────

/** Pose in room-local space; all metres; rotationY is yaw in radians. */
export interface RoomTransform {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export interface FloorPoint {
  x: number;
  z: number;
}

export type ScanConfidence = 0 | 1 | 2;

export interface ScannedWall {
  index: number;
  transform: RoomTransform;
  widthM: number;
  heightM: number;
  confidence: ScanConfidence;
}

export interface ScannedOpening {
  type: "door" | "window";
  /** Wall index this opening belongs to, or null if no wall matched. */
  wallIndex: number | null;
  transform: RoomTransform;
  /** Always present even when wallIndex is null, so the renderer can draw it. */
  absolutePosition: { x: number; z: number };
  widthM: number;
  heightM: number;
  confidence: ScanConfidence;
}

export interface ScannedObject {
  /** Stable id from RoomPlan (UUID). */
  objectId: string;
  /** RoomPlan category label e.g. "sofa", "bed", "television". */
  label: string;
  /** Phase 16: user override — rendered instead of `label` when present.
   *  The original `label` is preserved for auto-matching / suggestions. */
  userLabel?: string;
  transform: RoomTransform;
  widthM: number;
  heightM: number;
  depthM: number;
  confidence: ScanConfidence;
}

export type RoomScanAreaSource = "shoelace" | "bbox";

/**
 * Full scan payload emitted by the native plugin and sent to the server.
 * Kept as `RoomScanData` for backward compatibility with existing callers.
 */
export interface RoomScanData {
  schemaVersion: number;
  widthM: number;
  lengthM: number;
  heightM: number;
  areaSqM: number;
  areaSource: RoomScanAreaSource;
  wallCount: number;
  doorCount: number;
  windowCount: number;
  polygonClosed: boolean;
  hasCurvedWalls: boolean;
  floorPolygon: FloorPoint[];
  walls: ScannedWall[];
  openings: ScannedOpening[];
  objects: ScannedObject[];
  /** Phase 15: absolute on-device path to a USDZ file (iOS native only). */
  usdzPath?: string;
  scannedAt: string;
}

/** Server-returned RoomScan (= payload + server metadata). */
export interface RoomScan extends RoomScanData {
  id: string;
  roomId: string;
  areaSqFt: number;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  projectId: string;
  roomName: string;
  roomType: string;
  /** Populated in the frontend after GET /rooms/:id/scan or a successful scan. */
  scanData?: RoomScanData;
  createdAt: string;
  updatedAt: string;
}

export interface ClarificationQuestion {
  field: string;       // e.g. "lensIncluded", "shutterCount", "majorDamage"
  question: string;    // human-readable question
  inputType: "boolean" | "text" | "select";
  options?: string[];  // for select type
}

export interface ItemPhoto {
  id: string;
  itemId: string;
  photoPath: string;
  isPrimary: boolean;
  createdAt: string;
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
  photos?: ItemPhoto[];
  /** @deprecated — read via itemIntent(item) instead. Retained for API compatibility until backend Phase 4. */
  sentimentalFlag: boolean;
  /** @deprecated — read via itemIntent(item) instead. Retained for API compatibility until backend Phase 4. */
  keepFlag: boolean;
  /** @deprecated — read via itemIntent(item) instead. Retained for API compatibility until backend Phase 4. */
  willingToSell: boolean;
  recommendation: Recommendation;
  recommendationReason?: string;
  status: ItemStatus;
  identifiedName?: string;
  identifiedCategory?: string;
  identifiedBrand?: string;
  identifiedModel?: string;
  likelyModelOptions?: string[] | null;
  requiresModelSelection?: boolean;
  identificationConfidence?: number;
  identificationReasoning?: string;
  identificationStatus: IdentificationStatus;
  identificationQuality?: IdentificationQuality;
  pricingEligible?: boolean;
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
  // Room placement (nullable; set by tag-to-room flow)
  roomObjectId?: string;
  roomPositionX?: number;
  roomPositionZ?: number;
  rotationY?: number;
  // Phase 10: URL the user posted this item at (FB Marketplace etc.)
  listingUrl?: string;
  // Phase 11: realized sell price in USD (set when item marked sold)
  soldPriceUsd?: number;
  // Phase H: timestamp set when item transitions to a completed status
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemPlacementInput {
  roomObjectId?: string | null;
  roomPositionX?: number | null;
  roomPositionZ?: number | null;
  rotationY?: number | null;
}

export interface OrphanedItem {
  itemId: string;
  itemName: string;
  /** The roomObjectId stored on the item but missing from the current scan. */
  previousObjectId: string;
}

export type DecisionBucket = "sell" | "keep" | "ship" | "donate";
export type ItemDecisionAction = DecisionBucket | "sold" | "discarded" | "shipped" | "donated";

export type ItemIntent =
  | "undecided" | "sell" | "keep" | "ship" | "donate"
  | "sold" | "donated" | "shipped" | "discarded";

export type LifecycleStatus = "undecided" | "planned" | "completed";

/** Raw pre-multiplier band contributions from the decision service. */
export interface ScoreBreakdown {
  value: number;
  size: number;
  urgency: number;
  condition: number;
  sellBonus: number;
}

export type CalibrationConfidence = "low" | "medium" | "high";

/** Phase 14: one row per category with enough historical sales to calibrate. */
export interface CategoryCalibration {
  category: string;
  multiplier: number;
  sampleSize: number;
  variance: number;
  confidence: CalibrationConfidence;
}

export interface PrioritizedItem {
  itemId: string;
  score: number;
  recommendation: DecisionBucket;
  reason: string;
  breakdown: ScoreBreakdown;
  /** Phase 12–13: present when the category had ≥3 prior sales in this project
   *  so the value band was calibrated against actual outcomes. */
  calibration?: {
    category: string;
    multiplier: number;          // 0.5–1.5
    sampleSize: number;
    variance: number;            // population variance of ratios
    confidence: CalibrationConfidence;
  };
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

// ── eBay sold listings ──────────────────────────────────────────────────────

export interface EbaySoldListing {
  title: string;
  price: number;
  currency: string;
  url: string;
  condition?: string;
  soldDate?: string;
}

export interface EbaySoldResult {
  query: string;
  totalFound: number;
  avgPrice: number;
  medianPrice: number;
  lowPrice: number;
  highPrice: number;
  sampleListings: EbaySoldListing[];
}

// ── Decision engine ─────────────────────────────────────────────────────────

export type RecommendedAction = "SELL_NOW" | "SELL_LATER" | "SHIP" | "STORE" | "DONATE" | "DISCARD";
export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface DecisionBreakdown {
  valueScore: number;
  sizeScore: number;
  urgencyScore: number;
  conditionScore: number;
  demandScore: number;
  confidenceMultiplier: number;
}

export interface ItemDecisionResult {
  urgencyScore: number;
  recommendedAction: RecommendedAction;
  recommendedPlatform: string | null;
  rationale: string;
  breakdown: DecisionBreakdown;
  pricingConfidence: number;
  confidenceLevel: ConfidenceLevel;
}
