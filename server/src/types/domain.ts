export type MoveType = "CONUS" | "OCONUS" | "JAPAN" | "EUROPE" | "STORAGE_ONLY";

export type ConfigTier = "base" | "base_plus" | "bundle" | "full_kit";

export type IdentificationStatus = "NONE" | "SUGGESTED" | "CONFIRMED" | "EDITED";

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

export interface PricingContext {
  priceFairMarket?: number;
  pricingConfidence?: number;
  hasEbayComparables?: boolean;
  identificationStatus?: IdentificationStatus;
}

export interface RecommendationResult {
  recommendation: Recommendation;
  reason: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  branchOfService?: string;
  dutyStation?: string;
  preferredMarketplace?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

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

// ── Room visualization ──────────────────────────────────────────────────────

/** 4x4 pose collapsed to the fields we need for top-down rendering. */
export interface RoomTransform {
  x: number;        // metres, room-local
  y: number;        // metres (height above floor — informational in V1)
  z: number;        // metres, room-local
  rotationY: number; // radians about Y (up)
}

export interface RoomScanWall {
  index: number;
  transform: RoomTransform;
  widthM: number;
  heightM: number;
  confidence: 0 | 1 | 2; // 0=low, 1=medium, 2=high
}

export interface RoomScanOpening {
  type: "door" | "window";
  /** wall index this opening was snapped to, or null if none (free-floating). */
  wallIndex: number | null;
  transform: RoomTransform;
  /** Room-local (x, z) in metres. Always present so the renderer can draw the
   *  opening even when wallIndex is null. */
  absolutePosition: { x: number; z: number };
  widthM: number;
  heightM: number;
  confidence: 0 | 1 | 2;
}

export interface RoomScanObject {
  /** Stable id assigned by the plugin per scan so items can reference it. */
  objectId: string;
  label: string;
  /** Phase 16: user-supplied override. UI should fall back to `label` if absent.
   *  Never overwrite `label` — the original RoomPlan detection is preserved so
   *  it can still be used for auto-matching / suggestions. */
  userLabel?: string;
  transform: RoomTransform;
  widthM: number;
  heightM: number;
  depthM: number;
  confidence: 0 | 1 | 2;
}

export type RoomScanAreaSource = "shoelace" | "bbox";

export interface RoomScan {
  id: string;
  roomId: string;
  schemaVersion: number;
  widthM: number;
  lengthM: number;
  heightM: number;
  areaSqM: number;
  areaSqFt: number;
  /** "shoelace" = polygon-closed shoelace area; "bbox" = width*length fallback. */
  areaSource: RoomScanAreaSource;
  wallCount: number;
  doorCount: number;
  windowCount: number;
  polygonClosed: boolean;
  hasCurvedWalls: boolean;
  floorPolygon: Array<{ x: number; z: number }>;
  walls: RoomScanWall[];
  openings: RoomScanOpening[];
  objects: RoomScanObject[];
  /** Phase 15: absolute on-device path to a USDZ export (iOS only). */
  usdzPath?: string;
  scannedAt: string;
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
  // Room placement (nullable; set when user tags item in RoomViewer)
  roomObjectId?: string;
  roomPositionX?: number;
  roomPositionZ?: number;
  rotationY?: number;
  // Phase 10: URL the user posted this item at (FB Marketplace etc.)
  listingUrl?: string;
  // Phase 11: realized sell price in USD (set when the item is marked sold)
  soldPriceUsd?: number;
  createdAt: string;
  updatedAt: string;
}

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

export interface ModelNormalization {
  canonicalName: string;
  brand: string;
  model: string;
  category: string;
  isSpecialty: boolean;
  minReasonablePrice: number;
  maxReasonablePrice: number;
}
