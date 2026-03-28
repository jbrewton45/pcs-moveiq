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
  sentimentalFlag: z.boolean(),
  keepFlag: z.boolean(),
  willingToSell: z.boolean(),
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
