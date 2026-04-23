import { z } from "zod/v4";

export const CreateProjectSchema = z.object({
  projectName: z.string().min(1),
  currentLocation: z.string().min(1),
  destination: z.string().min(1),
  moveType: z.enum(["CONUS", "OCONUS", "JAPAN", "EUROPE", "STORAGE_ONLY"]),
  planningStartDate: z.string().date(),
  hardMoveDate: z.string().date(),
  optionalPackoutDate: z.string().date().optional(),
  housingAssumption: z.enum(["SMALLER", "SAME", "LARGER", "UNKNOWN"]),
  userGoal: z.enum([
    "MAXIMIZE_CASH",
    "REDUCE_STRESS",
    "REDUCE_SHIPMENT_BURDEN",
    "FIT_SMALLER_HOME",
    "BALANCED",
  ]),
  weightAllowanceLbs: z.number().positive().optional(),
});

export const CreateRoomSchema = z.object({
  projectId: z.string().min(1),
  roomName: z.string().min(1),
  roomType: z.string().min(1),
});

export const CreateItemSchema = z.object({
  projectId: z.string().min(1),
  roomId: z.string().min(1),
  itemName: z.string().min(1),
  category: z.string().min(1),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]),
  sizeClass: z.enum(["SMALL", "MEDIUM", "LARGE", "OVERSIZED"]),
  notes: z.string().optional().transform(v => v === "" ? undefined : v),
  weightLbs: z.number().positive().optional(),
  // Deprecated boolean inputs retained for API back-compat — logic no longer branches on them.
  sentimentalFlag: z.boolean().optional(),
  keepFlag: z.boolean().optional(),
  willingToSell: z.boolean().optional(),
  // New intent field: drives applyItemAction after createItem.
  intent: z.enum(["keep", "sell", "ship", "donate"]).optional(),
});

export const UpdateItemSchema = z.object({
  itemName: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]).optional(),
  sizeClass: z.enum(["SMALL", "MEDIUM", "LARGE", "OVERSIZED"]).optional(),
  notes: z.string().optional().transform(v => v === "" ? undefined : v),
  weightLbs: z.number().positive().optional().nullable(),
  sentimentalFlag: z.boolean().optional(),
  keepFlag: z.boolean().optional(),
  willingToSell: z.boolean().optional(),
});

export const BulkUpdateStatusSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
  status: z.enum([
    "UNREVIEWED", "REVIEWED", "LISTED", "SOLD",
    "DONATED", "STORED", "SHIPPED", "DISCARDED", "KEPT"
  ]),
});

export const BulkDeleteSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
});

export const UpdateRoomSchema = z.object({
  roomName: z.string().min(1).optional(),
  roomType: z.string().min(1).optional(),
});

// ── Decision action ─────────────────────────────────────────────────────────

export const ItemActionSchema = z.object({
  action: z.enum(["sell", "keep", "ship", "donate", "sold", "discarded", "shipped", "donated"]),
  /** Only meaningful when action === "sold"; ignored otherwise. Optional. */
  soldPriceUsd: z.number().nonnegative().max(1_000_000).optional(),
});

export const BulkItemActionSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
  action: z.enum(["sell", "keep", "ship", "donate", "sold", "discarded", "shipped", "donated"]),
});

export const UpdateItemListingSchema = z.object({
  listingUrl: z.string().min(1).max(2000).nullable(),
});

export const UpdateItemSoldPriceSchema = z.object({
  soldPriceUsd: z.number().nonnegative().max(1_000_000).nullable(),
});

// ── Room visualization payloads ─────────────────────────────────────────────

const TransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rotationY: z.number(),
});

const ConfidenceSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

const ScanWallSchema = z.object({
  index: z.number().int().min(0),
  transform: TransformSchema,
  widthM: z.number().nonnegative(),
  heightM: z.number().nonnegative(),
  confidence: ConfidenceSchema,
});

const ScanOpeningSchema = z.object({
  type: z.enum(["door", "window"]),
  wallIndex: z.number().int().nullable(),
  transform: TransformSchema,
  absolutePosition: z.object({ x: z.number(), z: z.number() }),
  widthM: z.number().nonnegative(),
  heightM: z.number().nonnegative(),
  confidence: ConfidenceSchema,
});

const ScanObjectSchema = z.object({
  objectId: z.string().min(1),
  label: z.string().min(1),
  /** Phase 16: user-supplied label override (preserved across scan uploads). */
  userLabel: z.string().min(1).max(100).optional(),
  transform: TransformSchema,
  widthM: z.number().nonnegative(),
  heightM: z.number().nonnegative(),
  depthM: z.number().nonnegative(),
  confidence: ConfidenceSchema,
});

// Phase 16: PUT /api/rooms/:id/object/:objectId payload.
// Set userLabel to a string to rename; send null to clear the override.
export const UpdateRoomObjectSchema = z.object({
  userLabel: z.string().min(1).max(100).nullable(),
});

export const ItemPlacementSchema = z.object({
  roomObjectId: z.string().min(1).nullable().optional(),
  roomPositionX: z.number().nullable().optional(),
  roomPositionZ: z.number().nullable().optional(),
  rotationY: z.number().nullable().optional(),
}).refine(
  (d) => {
    const hasObj = typeof d.roomObjectId === "string";
    const hasPos = typeof d.roomPositionX === "number" || typeof d.roomPositionZ === "number";
    return !(hasObj && hasPos);
  },
  { message: "roomObjectId and roomPositionX/Z are mutually exclusive — tag an object OR pin a coordinate, not both" }
);

export const RoomScanPayloadSchema = z.object({
  schemaVersion: z.number().int().min(1),
  widthM: z.number().nonnegative(),
  lengthM: z.number().nonnegative(),
  heightM: z.number().nonnegative(),
  areaSqM: z.number().nonnegative(),
  /** Either omit (server derives via sqMToSqFt) or provide explicitly. */
  areaSqFt: z.number().nonnegative().optional(),
  areaSource: z.enum(["shoelace", "bbox"]).default("bbox"),
  wallCount: z.number().int().nonnegative(),
  doorCount: z.number().int().nonnegative(),
  windowCount: z.number().int().nonnegative(),
  polygonClosed: z.boolean().default(false),
  hasCurvedWalls: z.boolean().default(false),
  floorPolygon: z.array(z.object({ x: z.number(), z: z.number() })),
  walls: z.array(ScanWallSchema),
  openings: z.array(ScanOpeningSchema),
  objects: z.array(ScanObjectSchema),
  /** Phase 15: optional on-device USDZ path. */
  usdzPath: z.string().min(1).max(2000).optional(),
  scannedAt: z.string().min(1),
});

export const UpdateProjectSchema = z.object({
  projectName: z.string().min(1).optional(),
  currentLocation: z.string().min(1).optional(),
  destination: z.string().min(1).optional(),
  moveType: z.enum(["CONUS", "OCONUS", "JAPAN", "EUROPE", "STORAGE_ONLY"]).optional(),
  planningStartDate: z.string().date().optional(),
  hardMoveDate: z.string().date().optional(),
  optionalPackoutDate: z.string().date().optional().transform(v => v === "" ? undefined : v),
  housingAssumption: z.enum(["SMALLER", "SAME", "LARGER", "UNKNOWN"]).optional(),
  userGoal: z.enum(["MAXIMIZE_CASH", "REDUCE_STRESS", "REDUCE_SHIPMENT_BURDEN", "FIT_SMALLER_HOME", "BALANCED"]).optional(),
  weightAllowanceLbs: z.number().positive().optional().nullable(),
});
