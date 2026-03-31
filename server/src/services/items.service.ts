import fs from "fs";
import path from "path";
import { query } from "../data/database.js";
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

async function getItemById(id: string): Promise<Item | undefined> {
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
