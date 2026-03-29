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

export type ComparableSource = "claude" | "ebay" | "mock";

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
  createdAt: string;
  updatedAt: string;
}
