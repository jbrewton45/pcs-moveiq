import fs from "fs";
import path from "path";
import { query, withTransaction } from "../data/database.js";
import type { Item, ItemCondition, ItemPhoto, ItemStatus, RecommendationResult, PricingContext, SizeClass } from "../types/domain.js";
import type { MoveType, HousingAssumption } from "../types/domain.js";
import { createId } from "../utils/id.js";
import { rowToItem } from "../utils/converters.js";

interface CreateItemInput {
  projectId: string;
  roomId: string;
  itemName: string;
  category: string;
  condition: ItemCondition;
  sizeClass: SizeClass;
  notes?: string;
  weightLbs?: number;
  sentimentalFlag: boolean;
  keepFlag: boolean;
  willingToSell: boolean;
}

interface UpdateItemInput {
  itemName?: string;
  category?: string;
  condition?: ItemCondition;
  sizeClass?: SizeClass;
  notes?: string;
  weightLbs?: number | null;
  sentimentalFlag?: boolean;
  keepFlag?: boolean;
  willingToSell?: boolean;
}

function rowToItemPhoto(row: Record<string, unknown>): ItemPhoto {
  return {
    id: row.id as string,
    itemId: row.itemId as string,
    photoPath: row.photoPath as string,
    isPrimary: !!row.isPrimary,
    createdAt: row.createdAt as string,
  };
}

async function listItemPhotos(itemId: string): Promise<ItemPhoto[]> {
  const result = await query(
    'SELECT id, "itemId", "photoPath", "isPrimary", "createdAt" FROM item_photos WHERE "itemId" = $1 ORDER BY "isPrimary" DESC, "createdAt" ASC',
    [itemId]
  );
  return result.rows.map((r) => rowToItemPhoto(r as Record<string, unknown>));
}

async function hydrateItemPhotos(item: Item): Promise<Item> {
  const photos = await listItemPhotos(item.id);
  const primary = photos.find((p) => p.isPrimary) ?? photos[0];
  return {
    ...item,
    photoPath: primary?.photoPath ?? item.photoPath,
    photos,
  };
}

function getConfidenceTier(confidence: number | undefined, hasEbay: boolean): "HIGH" | "MEDIUM" | "LOW" {
  let tier: "HIGH" | "MEDIUM" | "LOW" =
    (confidence ?? 0) >= 0.6 ? "HIGH" :
    (confidence ?? 0) >= 0.4 ? "MEDIUM" : "LOW";
  if (hasEbay && tier === "LOW") tier = "MEDIUM";
  else if (hasEbay && tier === "MEDIUM") tier = "HIGH";
  return tier;
}

function deriveRecommendation(
  input: { condition: ItemCondition; sizeClass: SizeClass; sentimentalFlag: boolean; keepFlag: boolean; willingToSell: boolean },
  moveType: MoveType,
  housingAssumption: HousingAssumption,
  pricingContext?: PricingContext,
): RecommendationResult {
  if (input.keepFlag || input.sentimentalFlag) {
    return { recommendation: "KEEP", reason: input.sentimentalFlag ? "Sentimental item — keep" : "Marked as keep" };
  }
  if (input.condition === "POOR") {
    return { recommendation: "DISCARD", reason: "Poor condition — not worth moving" };
  }

  const isOconus = moveType !== "CONUS";
  const isSmallerHousing = housingAssumption === "SMALLER";
  const isLarge = input.sizeClass === "LARGE" || input.sizeClass === "OVERSIZED";

  if (input.willingToSell) {
    const hasPricing = pricingContext?.priceFairMarket != null && pricingContext?.pricingConfidence != null;
    if (hasPricing) {
      const tier = getConfidenceTier(pricingContext!.pricingConfidence, !!pricingContext!.hasEbayComparables);
      const fmv = pricingContext!.priceFairMarket!;
      if (tier === "HIGH" && fmv >= 50 && (isLarge || isOconus)) {
        return { recommendation: "SELL_NOW", reason: "High-value item — sell before PCS" };
      }
      if ((tier === "HIGH" || tier === "MEDIUM") && fmv < 20) {
        return { recommendation: "DONATE", reason: "Low resale value — donate instead" };
      }
      if (tier === "LOW") {
        return { recommendation: "SELL_SOON", reason: "Low pricing confidence — take time to sell" };
      }
    }
    if (isLarge || isOconus) {
      return { recommendation: "SELL_NOW", reason: isOconus ? "OCONUS move — sell before PCS to avoid shipping costs" : "Large item — sell to reduce shipment weight" };
    }
    return { recommendation: "SELL_SOON", reason: "Willing to sell — list when ready" };
  }

  if (!isLarge) {
    return { recommendation: "SHIP", reason: "Small enough to ship" };
  }
  if (isSmallerHousing || isOconus) {
    return { recommendation: "STORE", reason: isSmallerHousing ? "Downsizing — store until next move" : "OCONUS — store oversized items" };
  }
  return { recommendation: "SHIP", reason: "Ship to destination" };
}

export async function listItemsByProject(projectId: string): Promise<Item[]> {
  const result = await query('SELECT * FROM items WHERE "projectId" = $1 ORDER BY "createdAt" ASC', [projectId]);
  const base = result.rows.map(r => rowToItem(r as Record<string, unknown>));
  return Promise.all(base.map(hydrateItemPhotos));
}

export async function listItemsByRoom(roomId: string): Promise<Item[]> {
  const result = await query('SELECT * FROM items WHERE "roomId" = $1 ORDER BY "createdAt" ASC', [roomId]);
  const base = result.rows.map(r => rowToItem(r as Record<string, unknown>));
  return Promise.all(base.map(hydrateItemPhotos));
}

export async function getItemById(id: string): Promise<Item | undefined> {
  const result = await query('SELECT * FROM items WHERE id = $1', [id]);
  if (result.rows.length === 0) return undefined;
  const base = rowToItem(result.rows[0] as Record<string, unknown>);
  return hydrateItemPhotos(base);
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const projectResult = await query('SELECT "moveType", "housingAssumption" FROM projects WHERE id = $1', [input.projectId]);
  if (projectResult.rows.length === 0) throw new Error("Project not found");

  const project = projectResult.rows[0] as { moveType: MoveType; housingAssumption: HousingAssumption };
  const now = new Date().toISOString();
  const id = createId("item");
  const { recommendation, reason } = deriveRecommendation(input, project.moveType, project.housingAssumption);

  await query(
    `INSERT INTO items (id, "projectId", "roomId", "itemName", category, condition, "sizeClass",
      notes, "weightLbs", "sentimentalFlag", "keepFlag", "willingToSell", recommendation, "recommendationReason", status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      id, input.projectId, input.roomId, input.itemName, input.category,
      input.condition, input.sizeClass, input.notes ?? null,
      input.weightLbs ?? null,
      input.sentimentalFlag, input.keepFlag, input.willingToSell,
      recommendation, reason, "UNREVIEWED", now, now
    ]
  );

  return (await getItemById(id))!;
}

/**
 * Apply a user-chosen action (sell/keep/ship/donate/sold/discarded/shipped) to an
 * item. Updates recommendation, status, keepFlag, updatedAt, and — on the first
 * active→terminal transition — completedAt. Does NOT touch pricing, placement,
 * identification, or photos.
 *
 * Returns { item, noOp: true } when the item is already in the target terminal
 * state and no write is needed. Returns null when the item doesn't exist.
 * Throws ItemActionConflictError when the item is already in a different terminal
 * state (or sold with a different price).
 */
export type ItemDecisionAction = "sell" | "keep" | "ship" | "donate" | "sold" | "discarded" | "shipped";

// ── Workstream F: terminal-status helpers ──────────────────────────────────

const COMPLETED_STATUSES: ReadonlySet<string> = new Set([
  "SOLD", "DONATED", "SHIPPED", "DISCARDED",
]);

export function isItemCompleted(status: string): boolean {
  return COMPLETED_STATUSES.has(status);
}

export class ItemActionConflictError extends Error {
  constructor(
    public readonly existingStatus: string,
    public readonly existingSoldPriceUsd: number | null,
  ) {
    super("Item is already completed with a different action");
    this.name = "ItemActionConflictError";
  }
}

export async function applyItemAction(
  id: string,
  action: ItemDecisionAction,
  opts: { soldPriceUsd?: number | null } = {}
): Promise<{ item: Item; noOp: boolean } | null> {
  // SELECT current state first — we need status, soldPriceUsd, completedAt
  const existingResult = await query(
    'SELECT status, "soldPriceUsd", "completedAt" FROM items WHERE id = $1',
    [id]
  );
  if (existingResult.rows.length === 0) return null;

  const existing = existingResult.rows[0] as {
    status: string;
    soldPriceUsd: number | null;
    completedAt: string | null;
  };

  const next = ACTION_MAP[action];
  const targetStatus = next.status;
  const now = new Date().toISOString();

  // ── Idempotency / conflict logic ─────────────────────────────────────────
  if (isItemCompleted(existing.status)) {
    // Same terminal status: check if this is a true no-op or a price backfill
    if (targetStatus === existing.status) {
      if (action === "sold") {
        const newPrice = opts.soldPriceUsd !== undefined ? opts.soldPriceUsd : null;
        const isSamePriceOrOmitted =
          newPrice === null ||
          newPrice === undefined ||
          newPrice === existing.soldPriceUsd;

        // Price backfill: existing SOLD with NULL price, caller provides a price
        if (existing.soldPriceUsd == null && newPrice != null) {
          // Allow the write — preserve original completedAt, just update the price
          await query(
            `UPDATE items
                SET "soldPriceUsd" = $1,
                    "updatedAt" = $2
              WHERE id = $3`,
            [newPrice, now, id]
          );
          const backfilled = await query('SELECT * FROM items WHERE id = $1', [id]);
          const item = backfilled.rows.length > 0
            ? await hydrateItemPhotos(rowToItem(backfilled.rows[0] as Record<string, unknown>))
            : null;
          if (!item) return null;
          return { item, noOp: false };
        }

        // True no-op: same status, same (or omitted) price
        if (isSamePriceOrOmitted) {
          const row = await query('SELECT * FROM items WHERE id = $1', [id]);
          const item = row.rows.length > 0
            ? await hydrateItemPhotos(rowToItem(row.rows[0] as Record<string, unknown>))
            : null;
          if (!item) return null;
          return { item, noOp: true };
        }

        // Different non-null price for already-sold item → conflict
        throw new ItemActionConflictError(existing.status, existing.soldPriceUsd);
      }

      // Non-sold terminal no-op
      const row = await query('SELECT * FROM items WHERE id = $1', [id]);
      const item = row.rows.length > 0
        ? await hydrateItemPhotos(rowToItem(row.rows[0] as Record<string, unknown>))
        : null;
      if (!item) return null;
      return { item, noOp: true };
    }

    // Different terminal target — conflict
    throw new ItemActionConflictError(existing.status, existing.soldPriceUsd);
  }

  // ── Active → any transition ───────────────────────────────────────────────
  const isTerminalTransition = isItemCompleted(targetStatus);
  const completedAt = isTerminalTransition ? now : null;

  if (action === "sold" && opts.soldPriceUsd !== undefined) {
    await query(
      `UPDATE items
          SET recommendation = $1,
              status = $2,
              "keepFlag" = $3,
              "soldPriceUsd" = $4,
              "completedAt" = COALESCE("completedAt", $5),
              "updatedAt" = $6
        WHERE id = $7`,
      [next.recommendation, next.status, next.keepFlag, opts.soldPriceUsd, completedAt, now, id]
    );
  } else {
    await query(
      `UPDATE items
          SET recommendation = $1,
              status = $2,
              "keepFlag" = $3,
              "completedAt" = COALESCE("completedAt", $4),
              "updatedAt" = $5
        WHERE id = $6`,
      [next.recommendation, next.status, next.keepFlag, completedAt, now, id]
    );
  }

  const updated = await query('SELECT * FROM items WHERE id = $1', [id]);
  const item = updated.rows.length > 0
    ? await hydrateItemPhotos(rowToItem(updated.rows[0] as Record<string, unknown>))
    : null;
  if (!item) return null;
  return { item, noOp: false };
}

/**
 * Set (or clear with `null`) the realized sell price for an item. Pure metadata:
 * does not change recommendation, status, or keepFlag. Typically used after
 * an item has already been marked sold, to capture/correct the final price.
 */
export async function updateItemSoldPrice(
  id: string,
  soldPriceUsd: number | null
): Promise<Item | null> {
  const existingResult = await query('SELECT id FROM items WHERE id = $1', [id]);
  if (existingResult.rows.length === 0) return null;

  const now = new Date().toISOString();
  await query(
    'UPDATE items SET "soldPriceUsd" = $1, "updatedAt" = $2 WHERE id = $3',
    [soldPriceUsd, now, id]
  );

  const row = await query('SELECT * FROM items WHERE id = $1', [id]);
  return row.rows.length > 0
    ? await hydrateItemPhotos(rowToItem(row.rows[0] as Record<string, unknown>))
    : null;
}

const ACTION_MAP: Record<ItemDecisionAction, { recommendation: string; status: string; keepFlag: boolean }> = {
  sell:      { recommendation: "SELL_NOW", status: "LISTED",    keepFlag: false },
  keep:      { recommendation: "KEEP",     status: "KEPT",      keepFlag: true  },
  ship:      { recommendation: "SHIP",     status: "REVIEWED",  keepFlag: false },
  donate:    { recommendation: "DONATE",   status: "DONATED",   keepFlag: false },
  sold:      { recommendation: "COMPLETE", status: "SOLD",      keepFlag: false },
  discarded: { recommendation: "DISCARD",  status: "DISCARDED", keepFlag: false },
  shipped:   { recommendation: "SHIP",     status: "SHIPPED",   keepFlag: false },
};

/**
 * Save (or clear, with `null`) the URL the user posted this item at —
 * e.g. the Facebook Marketplace / OfferUp / Craigslist listing link. Pure
 * metadata; does not change recommendation or status.
 */
export async function updateItemListing(
  id: string,
  listingUrl: string | null
): Promise<Item | null> {
  const existingResult = await query('SELECT id FROM items WHERE id = $1', [id]);
  if (existingResult.rows.length === 0) return null;

  const now = new Date().toISOString();
  await query(
    'UPDATE items SET "listingUrl" = $1, "updatedAt" = $2 WHERE id = $3',
    [listingUrl, now, id]
  );

  const row = await query('SELECT * FROM items WHERE id = $1', [id]);
  return row.rows.length > 0
    ? await hydrateItemPhotos(rowToItem(row.rows[0] as Record<string, unknown>))
    : null;
}

/**
 * Apply the same action to many items inside ONE database transaction — either
 * all succeed or none do. Silently skips ids that no longer exist. Returns the
 * fully-hydrated items (with photos) for the ids that were actually updated.
 */
export async function applyBulkItemAction(
  itemIds: string[],
  action: ItemDecisionAction
): Promise<Item[]> {
  if (itemIds.length === 0) return [];
  const next = ACTION_MAP[action];
  const now = new Date().toISOString();

  const updatedIds: string[] = [];
  await withTransaction(async (client) => {
    for (const id of itemIds) {
      const res = await client.query(
        `UPDATE items
            SET recommendation = $1,
                status = $2,
                "keepFlag" = $3,
                "updatedAt" = $4
          WHERE id = $5`,
        [next.recommendation, next.status, next.keepFlag, now, id]
      );
      if ((res.rowCount ?? 0) > 0) updatedIds.push(id);
    }
  });

  // Re-hydrate outside the transaction so photo-hydration does one read per row
  // without holding the transactional connection open.
  const hydrated: Item[] = [];
  for (const id of updatedIds) {
    const row = await query('SELECT * FROM items WHERE id = $1', [id]);
    if (row.rows.length > 0) {
      hydrated.push(await hydrateItemPhotos(rowToItem(row.rows[0] as Record<string, unknown>)));
    }
  }
  return hydrated;
}

/** Update an item's room placement. All fields are optional and nullable — pass
 *  `null` explicitly to clear a field, or omit to leave it unchanged. Setting
 *  roomObjectId clears roomPositionX/Z in the write (and vice versa) so state
 *  stays consistent. Throws PlacementValidationError for unusable inputs. */
export interface UpdateItemPlacementInput {
  roomObjectId?: string | null;
  roomPositionX?: number | null;
  roomPositionZ?: number | null;
  rotationY?: number | null;
}

/** Signals a client-caused placement problem; the controller maps this to 400. */
export class PlacementValidationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PlacementValidationError";
  }
}

export async function updateItemPlacement(
  id: string,
  input: UpdateItemPlacementInput
): Promise<Item | null> {
  const existingResult = await query('SELECT * FROM items WHERE id = $1', [id]);
  if (existingResult.rows.length === 0) return null;
  const existing = rowToItem(existingResult.rows[0] as Record<string, unknown>);

  // Merge: "key in input" means caller is explicitly setting (incl. to null);
  // missing key means "leave as existing".
  let finalObjectId: string | null | undefined = "roomObjectId" in input
    ? input.roomObjectId
    : existing.roomObjectId;
  let finalX: number | null | undefined = "roomPositionX" in input
    ? input.roomPositionX
    : existing.roomPositionX;
  let finalZ: number | null | undefined = "roomPositionZ" in input
    ? input.roomPositionZ
    : existing.roomPositionZ;
  let finalRotY: number | null | undefined = "rotationY" in input
    ? input.rotationY
    : existing.rotationY;

  // Mutual exclusion: when the caller sets objectId, wipe XY (and vice versa).
  if (typeof input.roomObjectId === "string") {
    finalX = null;
    finalZ = null;
    finalRotY = null;
  } else if (typeof input.roomPositionX === "number" || typeof input.roomPositionZ === "number") {
    finalObjectId = null;
  }

  // If the caller is setting a new roomObjectId, verify it exists in the room's
  // current scan. We look up via JOIN to items.roomId → room_scans.roomId so we
  // don't have to fetch the scan separately.
  if (typeof input.roomObjectId === "string") {
    const scanResult = await query(
      `SELECT rs.objects
         FROM room_scans rs
         JOIN items it ON it."roomId" = rs."roomId"
        WHERE it.id = $1
        LIMIT 1`,
      [id]
    );
    if (scanResult.rows.length === 0) {
      throw new PlacementValidationError(400, "Cannot tag an object: no scan exists for this room yet");
    }
    const raw = (scanResult.rows[0] as { objects: unknown }).objects;
    const objects: Array<{ objectId?: string }> = Array.isArray(raw)
      ? (raw as Array<{ objectId?: string }>)
      : typeof raw === "string"
        ? (JSON.parse(raw) as Array<{ objectId?: string }>)
        : [];
    const found = objects.some((o) => o && o.objectId === input.roomObjectId);
    if (!found) {
      throw new PlacementValidationError(
        400,
        `roomObjectId "${input.roomObjectId}" is not present in the current scan — rescan or pick a different object`
      );
    }
  }

  const now = new Date().toISOString();
  await query(
    `UPDATE items
        SET "roomObjectId" = $1,
            "roomPositionX" = $2,
            "roomPositionZ" = $3,
            "rotationY" = $4,
            "updatedAt" = $5
      WHERE id = $6`,
    [finalObjectId ?? null, finalX ?? null, finalZ ?? null, finalRotY ?? null, now, id]
  );

  const updated = await query('SELECT * FROM items WHERE id = $1', [id]);
  return updated.rows.length > 0
    ? await hydrateItemPhotos(rowToItem(updated.rows[0] as Record<string, unknown>))
    : null;
}

export async function updateItem(id: string, input: UpdateItemInput): Promise<Item | null> {
  const existing = await getItemById(id);
  if (!existing) return null;

  const merged = {
    itemName: input.itemName ?? existing.itemName,
    category: input.category ?? existing.category,
    condition: (input.condition ?? existing.condition) as ItemCondition,
    sizeClass: (input.sizeClass ?? existing.sizeClass) as SizeClass,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    weightLbs: input.weightLbs !== undefined ? input.weightLbs : existing.weightLbs,
    sentimentalFlag: input.sentimentalFlag ?? existing.sentimentalFlag,
    keepFlag: input.keepFlag ?? existing.keepFlag,
    willingToSell: input.willingToSell ?? existing.willingToSell,
  };

  const projectResult = await query('SELECT "moveType", "housingAssumption" FROM projects WHERE id = $1', [existing.projectId]);
  let recommendation = existing.recommendation;
  let reason = existing.recommendationReason ?? "";
  if (projectResult.rows.length > 0) {
    const project = projectResult.rows[0] as { moveType: MoveType; housingAssumption: HousingAssumption };
    const pricingCtx: PricingContext | undefined = existing.priceFairMarket != null ? {
      priceFairMarket: existing.priceFairMarket,
      pricingConfidence: existing.pricingConfidence,
      hasEbayComparables: false,
      identificationStatus: existing.identificationStatus,
    } : undefined;
    const result = deriveRecommendation(merged, project.moveType, project.housingAssumption, pricingCtx);
    recommendation = result.recommendation;
    reason = result.reason;
  }

  const now = new Date().toISOString();
  await query(
    `UPDATE items SET "itemName" = $1, category = $2, condition = $3, "sizeClass" = $4,
      notes = $5, "weightLbs" = $6, "sentimentalFlag" = $7, "keepFlag" = $8, "willingToSell" = $9,
      recommendation = $10, "recommendationReason" = $11, "updatedAt" = $12
     WHERE id = $13`,
    [
      merged.itemName, merged.category, merged.condition, merged.sizeClass,
      merged.notes ?? null, merged.weightLbs ?? null,
      merged.sentimentalFlag, merged.keepFlag, merged.willingToSell,
      recommendation, reason, now, id
    ]
  );

  return (await getItemById(id))!;
}

export async function deleteItem(id: string): Promise<boolean> {
  const item = await getItemById(id);
  if (!item) return false;

  for (const photo of item.photos ?? []) {
    const filePath = path.join(process.cwd(), "uploads", photo.photoPath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  const result = await query('DELETE FROM items WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function setItemPhoto(id: string, photoPath: string): Promise<Item | null> {
  const existing = await getItemById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  await query('DELETE FROM item_photos WHERE "itemId" = $1', [id]);
  await query(
    'INSERT INTO item_photos (id, "itemId", "photoPath", "isPrimary", "createdAt") VALUES ($1, $2, $3, TRUE, $4)',
    [createId("photo"), id, photoPath, now]
  );
  await query('UPDATE items SET "photoPath" = $1, "updatedAt" = $2 WHERE id = $3', [photoPath, now, id]);
  return (await getItemById(id))!;
}

export async function removeItemPhoto(id: string): Promise<Item | null> {
  const existing = await getItemById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const primary = (existing.photos ?? []).find((p) => p.isPrimary) ?? existing.photos?.[0];
  if (primary) {
    await query('DELETE FROM item_photos WHERE id = $1 AND "itemId" = $2', [primary.id, id]);
  }
  const nextPrimary = await query(
    'SELECT id, "photoPath" FROM item_photos WHERE "itemId" = $1 ORDER BY "createdAt" ASC LIMIT 1',
    [id]
  );
  if (nextPrimary.rows.length > 0) {
    const primaryId = (nextPrimary.rows[0] as { id: string }).id;
    const primaryPath = (nextPrimary.rows[0] as { photoPath: string }).photoPath;
    await query('UPDATE item_photos SET "isPrimary" = FALSE WHERE "itemId" = $1', [id]);
    await query('UPDATE item_photos SET "isPrimary" = TRUE WHERE id = $1', [primaryId]);
    await query('UPDATE items SET "photoPath" = $1, "updatedAt" = $2 WHERE id = $3', [primaryPath, now, id]);
  } else {
    await query('UPDATE items SET "photoPath" = NULL, "updatedAt" = $1 WHERE id = $2', [now, id]);
  }
  return (await getItemById(id))!;
}

export async function addItemPhoto(id: string, photoPath: string): Promise<Item | null> {
  const existing = await getItemById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const shouldBePrimary = (existing.photos?.length ?? 0) === 0;
  if (shouldBePrimary) {
    await query('UPDATE item_photos SET "isPrimary" = FALSE WHERE "itemId" = $1', [id]);
  }
  await query(
    'INSERT INTO item_photos (id, "itemId", "photoPath", "isPrimary", "createdAt") VALUES ($1, $2, $3, $4, $5)',
    [createId("photo"), id, photoPath, shouldBePrimary, now]
  );
  if (shouldBePrimary) {
    await query('UPDATE items SET "photoPath" = $1, "updatedAt" = $2 WHERE id = $3', [photoPath, now, id]);
  }
  return (await getItemById(id))!;
}

export async function removeItemPhotoById(id: string, photoId: string): Promise<{ item: Item; removedPath: string } | null> {
  const photoResult = await query(
    'SELECT id, "photoPath", "isPrimary" FROM item_photos WHERE id = $1 AND "itemId" = $2',
    [photoId, id]
  );
  if (photoResult.rows.length === 0) return null;

  const row = photoResult.rows[0] as { id: string; photoPath: string; isPrimary: boolean };
  await query('DELETE FROM item_photos WHERE id = $1 AND "itemId" = $2', [photoId, id]);

  if (row.isPrimary) {
    const nextPrimary = await query(
      'SELECT id, "photoPath" FROM item_photos WHERE "itemId" = $1 ORDER BY "createdAt" ASC LIMIT 1',
      [id]
    );
    if (nextPrimary.rows.length > 0) {
      const nextId = (nextPrimary.rows[0] as { id: string }).id;
      const nextPath = (nextPrimary.rows[0] as { photoPath: string }).photoPath;
      await query('UPDATE item_photos SET "isPrimary" = FALSE WHERE "itemId" = $1', [id]);
      await query('UPDATE item_photos SET "isPrimary" = TRUE WHERE id = $1', [nextId]);
      await query('UPDATE items SET "photoPath" = $1, "updatedAt" = $2 WHERE id = $3', [nextPath, new Date().toISOString(), id]);
    } else {
      await query('UPDATE items SET "photoPath" = NULL, "updatedAt" = $1 WHERE id = $2', [new Date().toISOString(), id]);
    }
  }

  const item = await getItemById(id);
  if (!item) return null;
  return { item, removedPath: row.photoPath };
}

export async function setPrimaryItemPhoto(id: string, photoId: string): Promise<Item | null> {
  const existing = await getItemById(id);
  if (!existing) return null;
  const target = (existing.photos ?? []).find((p) => p.id === photoId);
  if (!target) return null;
  await query('UPDATE item_photos SET "isPrimary" = FALSE WHERE "itemId" = $1', [id]);
  await query('UPDATE item_photos SET "isPrimary" = TRUE WHERE id = $1 AND "itemId" = $2', [photoId, id]);
  await query('UPDATE items SET "photoPath" = $1, "updatedAt" = $2 WHERE id = $3', [target.photoPath, new Date().toISOString(), id]);
  return (await getItemById(id))!;
}

export async function getItemPhoto(id: string): Promise<string | undefined> {
  const item = await getItemById(id);
  return item?.photos?.find((p) => p.isPrimary)?.photoPath ?? item?.photos?.[0]?.photoPath ?? item?.photoPath;
}

export async function getItemPhotos(id: string): Promise<ItemPhoto[]> {
  return listItemPhotos(id);
}

export async function clearItemPhotos(id: string): Promise<string[]> {
  const photos = await listItemPhotos(id);
  if (photos.length > 0) {
    await query('DELETE FROM item_photos WHERE "itemId" = $1', [id]);
  }
  const now = new Date().toISOString();
  await query('UPDATE items SET "photoPath" = NULL, "updatedAt" = $1 WHERE id = $2', [now, id]);
  return photos.map((p) => p.photoPath);
}

export async function getProjectSummary(projectId: string): Promise<Record<string, number>> {
  const result = await query(
    'SELECT recommendation, COUNT(*) as count FROM items WHERE "projectId" = $1 GROUP BY recommendation',
    [projectId]
  );
  const summary: Record<string, number> = {};
  for (const row of result.rows as { recommendation: string; count: string }[]) {
    summary[row.recommendation] = Number(row.count);
  }
  return summary;
}

export async function getPackingList(projectId: string): Promise<{ recommendation: string; items: Item[] }[]> {
  const items = await listItemsByProject(projectId);
  const groups: Record<string, Item[]> = {};
  for (const item of items) {
    if (!groups[item.recommendation]) groups[item.recommendation] = [];
    groups[item.recommendation].push(item);
  }
  const order = ["SELL_NOW", "SELL_SOON", "SHIP", "STORE", "DONATE", "DISCARD", "KEEP"];
  return order.filter(r => groups[r]).map(r => ({ recommendation: r, items: groups[r] }));
}

export async function bulkUpdateStatus(itemIds: string[], status: ItemStatus): Promise<number> {
  if (itemIds.length === 0) return 0;
  const now = new Date().toISOString();
  const result = await query(
    'UPDATE items SET status = $1, "updatedAt" = $2 WHERE id = ANY($3)',
    [status, now, itemIds]
  );
  return result.rowCount ?? 0;
}

export async function bulkDeleteItems(itemIds: string[]): Promise<number> {
  if (itemIds.length === 0) return 0;
  const result = await query('DELETE FROM items WHERE id = ANY($1)', [itemIds]);
  return result.rowCount ?? 0;
}

export async function getProjectWeightSummary(projectId: string): Promise<{
  totalWeight: number;
  roomWeights: Record<string, number>;
  itemsWithWeight: number;
  itemsWithoutWeight: number;
}> {
  const totalResult = await query(
    'SELECT COALESCE(SUM("weightLbs"), 0) as total FROM items WHERE "projectId" = $1 AND "weightLbs" IS NOT NULL',
    [projectId]
  );
  const countResult = await query(
    `SELECT
      COUNT(CASE WHEN "weightLbs" IS NOT NULL THEN 1 END) as "withWeight",
      COUNT(CASE WHEN "weightLbs" IS NULL THEN 1 END) as "withoutWeight"
     FROM items WHERE "projectId" = $1`,
    [projectId]
  );
  const roomResult = await query(
    `SELECT "roomId", COALESCE(SUM("weightLbs"), 0) as total
     FROM items WHERE "projectId" = $1 AND "weightLbs" IS NOT NULL
     GROUP BY "roomId"`,
    [projectId]
  );

  const totalRow = totalResult.rows[0] as { total: string };
  const countRow = countResult.rows[0] as { withWeight: string; withoutWeight: string };
  const roomWeights: Record<string, number> = {};
  for (const row of roomResult.rows as { roomId: string; total: string }[]) {
    roomWeights[row.roomId] = Number(row.total);
  }

  return {
    totalWeight: Number(totalRow.total),
    roomWeights,
    itemsWithWeight: Number(countRow.withWeight),
    itemsWithoutWeight: Number(countRow.withoutWeight),
  };
}

export async function rederiveRecommendation(itemId: string): Promise<Item | null> {
  const result = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  if (result.rows.length === 0) return null;

  const item = rowToItem(result.rows[0] as Record<string, unknown>);

  // Workstream F: never re-derive for completed items — their recommendation is
  // the terminal record of what was decided and must not be overwritten.
  if (isItemCompleted(item.status)) return item;

  const projectResult = await query(
    'SELECT "moveType", "housingAssumption" FROM projects WHERE id = $1',
    [item.projectId]
  );
  if (projectResult.rows.length === 0) return item;

  const project = projectResult.rows[0] as { moveType: MoveType; housingAssumption: HousingAssumption };
  const ebayResult = await query(
    "SELECT COUNT(*) as cnt FROM comparables WHERE \"itemId\" = $1 AND source = 'ebay'",
    [itemId]
  );
  const ebayCount = Number((ebayResult.rows[0] as { cnt: string }).cnt);

  const pricingCtx: PricingContext | undefined = item.priceFairMarket != null ? {
    priceFairMarket: item.priceFairMarket,
    pricingConfidence: item.pricingConfidence,
    hasEbayComparables: ebayCount > 0,
    identificationStatus: item.identificationStatus,
  } : undefined;

  const { recommendation, reason } = deriveRecommendation(
    item, project.moveType, project.housingAssumption, pricingCtx,
  );

  if (recommendation !== item.recommendation || reason !== item.recommendationReason) {
    const now = new Date().toISOString();
    await query(
      'UPDATE items SET recommendation = $1, "recommendationReason" = $2, "updatedAt" = $3 WHERE id = $4',
      [recommendation, reason, now, itemId]
    );
  }

  const updated = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  return updated.rows.length > 0 ? rowToItem(updated.rows[0] as Record<string, unknown>) : null;
}

export async function submitClarifications(itemId: string, answers: Record<string, string>): Promise<Item | null> {
  const existing = await getItemById(itemId);
  if (!existing) return null;
  const now = new Date().toISOString();
  await query(
    `UPDATE items SET "clarificationAnswers" = $1, "pendingClarifications" = NULL, "updatedAt" = $2 WHERE id = $3`,
    [JSON.stringify(answers), now, itemId]
  );
  return (await getItemById(itemId))!;
}
