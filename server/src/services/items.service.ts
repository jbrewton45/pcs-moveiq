import fs from "fs";
import path from "path";
import { db } from "../data/database.js";
import type { Item, ItemCondition, ItemStatus, Recommendation, RecommendationResult, PricingContext, SizeClass } from "../types/domain.js";
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
  // 1. Explicit keep
  if (input.keepFlag || input.sentimentalFlag) {
    return { recommendation: "KEEP", reason: input.sentimentalFlag ? "Sentimental item — keep" : "Marked as keep" };
  }

  // 2. Poor condition → discard
  if (input.condition === "POOR") {
    return { recommendation: "DISCARD", reason: "Poor condition — not worth moving" };
  }

  const isOconus = moveType !== "CONUS";
  const isSmallerHousing = housingAssumption === "SMALLER";
  const isLarge = input.sizeClass === "LARGE" || input.sizeClass === "OVERSIZED";

  // 3. Willing to sell — pricing-informed when data exists
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

    // Fall through to original logic
    if (isLarge || isOconus) {
      return { recommendation: "SELL_NOW", reason: isOconus ? "OCONUS move — sell before PCS to avoid shipping costs" : "Large item — sell to reduce shipment weight" };
    }
    return { recommendation: "SELL_SOON", reason: "Willing to sell — list when ready" };
  }

  // 4. Not for sale
  if (!isLarge) {
    return { recommendation: "SHIP", reason: "Small enough to ship" };
  }

  if (isSmallerHousing || isOconus) {
    return { recommendation: "STORE", reason: isSmallerHousing ? "Downsizing — store until next move" : "OCONUS — store oversized items" };
  }
  return { recommendation: "SHIP", reason: "Ship to destination" };
}

export function listItemsByProject(projectId: string): Item[] {
  const rows = db.prepare("SELECT * FROM items WHERE projectId = ? ORDER BY createdAt ASC").all(projectId);
  return rows.map(r => rowToItem(r as Record<string, unknown>));
}

export function listItemsByRoom(roomId: string): Item[] {
  const rows = db.prepare("SELECT * FROM items WHERE roomId = ? ORDER BY createdAt ASC").all(roomId);
  return rows.map(r => rowToItem(r as Record<string, unknown>));
}

function getItemById(id: string): Item | undefined {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  return row ? rowToItem(row as Record<string, unknown>) : undefined;
}

export function createItem(input: CreateItemInput): Item {
  // Look up project for recommendation context
  const project = db.prepare("SELECT moveType, housingAssumption FROM projects WHERE id = ?").get(input.projectId) as { moveType: MoveType; housingAssumption: HousingAssumption } | undefined;
  if (!project) throw new Error("Project not found");

  const now = new Date().toISOString();
  const id = createId("item");
  const { recommendation, reason } = deriveRecommendation(input, project.moveType, project.housingAssumption);

  db.prepare(`
    INSERT INTO items (id, projectId, roomId, itemName, category, condition, sizeClass,
      notes, weightLbs, sentimentalFlag, keepFlag, willingToSell, recommendation, recommendationReason, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.projectId, input.roomId, input.itemName, input.category,
    input.condition, input.sizeClass, input.notes ?? null,
    input.weightLbs ?? null,
    input.sentimentalFlag ? 1 : 0, input.keepFlag ? 1 : 0, input.willingToSell ? 1 : 0,
    recommendation, reason, "UNREVIEWED", now, now
  );

  return getItemById(id)!;
}

export function updateItem(id: string, input: UpdateItemInput): Item | null {
  const existing = getItemById(id);
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

  // Re-derive recommendation with project context + existing pricing data
  const project = db.prepare("SELECT moveType, housingAssumption FROM projects WHERE id = ?").get(existing.projectId) as { moveType: MoveType; housingAssumption: HousingAssumption } | undefined;

  let recommendation = existing.recommendation;
  let reason = existing.recommendationReason ?? "";
  if (project) {
    const pricingCtx: PricingContext | undefined = existing.priceFairMarket != null ? {
      priceFairMarket: existing.priceFairMarket,
      pricingConfidence: existing.pricingConfidence,
      hasEbayComparables: false, // not re-checking comps on edit
      identificationStatus: existing.identificationStatus,
    } : undefined;
    const result = deriveRecommendation(merged, project.moveType, project.housingAssumption, pricingCtx);
    recommendation = result.recommendation;
    reason = result.reason;
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE items SET itemName = ?, category = ?, condition = ?, sizeClass = ?,
      notes = ?, weightLbs = ?, sentimentalFlag = ?, keepFlag = ?, willingToSell = ?,
      recommendation = ?, recommendationReason = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    merged.itemName, merged.category, merged.condition, merged.sizeClass,
    merged.notes ?? null, merged.weightLbs ?? null,
    merged.sentimentalFlag ? 1 : 0,
    merged.keepFlag ? 1 : 0, merged.willingToSell ? 1 : 0,
    recommendation, reason, now, id
  );

  return getItemById(id)!;
}

export function deleteItem(id: string): boolean {
  const item = getItemById(id);
  if (!item) return false;

  // Delete photo file if exists
  if (item.photoPath) {
    const filePath = path.join(process.cwd(), "uploads", item.photoPath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  const result = db.prepare("DELETE FROM items WHERE id = ?").run(id);
  return result.changes > 0;
}

export function setItemPhoto(id: string, photoPath: string): Item | null {
  const existing = getItemById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare("UPDATE items SET photoPath = ?, updatedAt = ? WHERE id = ?").run(photoPath, now, id);
  return getItemById(id)!;
}

export function removeItemPhoto(id: string): Item | null {
  const existing = getItemById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare("UPDATE items SET photoPath = NULL, updatedAt = ? WHERE id = ?").run(now, id);
  return getItemById(id)!;
}

export function getItemPhoto(id: string): string | undefined {
  const item = getItemById(id);
  return item?.photoPath;
}

export function getProjectSummary(projectId: string): Record<string, number> {
  const rows = db.prepare(
    "SELECT recommendation, COUNT(*) as count FROM items WHERE projectId = ? GROUP BY recommendation"
  ).all(projectId) as { recommendation: string; count: number }[];

  const summary: Record<string, number> = {};
  for (const row of rows) {
    summary[row.recommendation] = row.count;
  }
  return summary;
}

export function getPackingList(projectId: string): { recommendation: string; items: Item[] }[] {
  const items = listItemsByProject(projectId);
  const groups: Record<string, Item[]> = {};
  for (const item of items) {
    if (!groups[item.recommendation]) groups[item.recommendation] = [];
    groups[item.recommendation].push(item);
  }
  const order = ["SELL_NOW", "SELL_SOON", "SHIP", "STORE", "DONATE", "DISCARD", "KEEP"];
  return order.filter(r => groups[r]).map(r => ({ recommendation: r, items: groups[r] }));
}

export function bulkUpdateStatus(itemIds: string[], status: ItemStatus): number {
  const now = new Date().toISOString();
  const placeholders = itemIds.map(() => "?").join(",");
  const result = db.prepare(
    `UPDATE items SET status = ?, updatedAt = ? WHERE id IN (${placeholders})`
  ).run(status, now, ...itemIds);
  return result.changes;
}

export function bulkDeleteItems(itemIds: string[]): number {
  const placeholders = itemIds.map(() => "?").join(",");
  const result = db.prepare(
    `DELETE FROM items WHERE id IN (${placeholders})`
  ).run(...itemIds);
  return result.changes;
}

export function getProjectWeightSummary(projectId: string): {
  totalWeight: number;
  roomWeights: Record<string, number>;
  itemsWithWeight: number;
  itemsWithoutWeight: number;
} {
  const totalRow = db.prepare(
    "SELECT COALESCE(SUM(weightLbs), 0) as total FROM items WHERE projectId = ? AND weightLbs IS NOT NULL"
  ).get(projectId) as { total: number };

  const countRows = db.prepare(
    "SELECT COUNT(CASE WHEN weightLbs IS NOT NULL THEN 1 END) as withWeight, COUNT(CASE WHEN weightLbs IS NULL THEN 1 END) as withoutWeight FROM items WHERE projectId = ?"
  ).get(projectId) as { withWeight: number; withoutWeight: number };

  const roomRows = db.prepare(
    "SELECT roomId, COALESCE(SUM(weightLbs), 0) as total FROM items WHERE projectId = ? AND weightLbs IS NOT NULL GROUP BY roomId"
  ).all(projectId) as { roomId: string; total: number }[];

  const roomWeights: Record<string, number> = {};
  for (const row of roomRows) {
    roomWeights[row.roomId] = row.total;
  }

  return {
    totalWeight: totalRow.total,
    roomWeights,
    itemsWithWeight: countRows.withWeight,
    itemsWithoutWeight: countRows.withoutWeight,
  };
}

export function rederiveRecommendation(itemId: string): Item | null {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  if (!row) return null;

  const item = rowToItem(row as Record<string, unknown>);
  const project = db.prepare("SELECT moveType, housingAssumption FROM projects WHERE id = ?").get(item.projectId) as { moveType: MoveType; housingAssumption: HousingAssumption } | undefined;
  if (!project) return item;

  // Check for eBay comparables
  const ebayCount = db.prepare("SELECT COUNT(*) as cnt FROM comparables WHERE itemId = ? AND source = 'ebay'").get(itemId) as { cnt: number };

  const pricingCtx: PricingContext | undefined = item.priceFairMarket != null ? {
    priceFairMarket: item.priceFairMarket,
    pricingConfidence: item.pricingConfidence,
    hasEbayComparables: ebayCount.cnt > 0,
    identificationStatus: item.identificationStatus,
  } : undefined;

  const { recommendation, reason } = deriveRecommendation(
    item, project.moveType, project.housingAssumption, pricingCtx,
  );

  if (recommendation !== item.recommendation || reason !== item.recommendationReason) {
    const now = new Date().toISOString();
    db.prepare("UPDATE items SET recommendation = ?, recommendationReason = ?, updatedAt = ? WHERE id = ?")
      .run(recommendation, reason, now, itemId);
  }

  const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  return updated ? rowToItem(updated as Record<string, unknown>) : null;
}
