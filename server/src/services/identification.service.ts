import { db } from "../data/database.js";
import type { Item } from "../types/domain.js";
import { rowToItem } from "../utils/converters.js";
import { claudeIdentify, isClaudeAvailable } from "../providers/claude.provider.js";
import { openaiIdentify, isOpenAIAvailable } from "../providers/openai.provider.js";

interface IdentificationResult {
  identifiedName: string;
  identifiedCategory: string;
  identifiedBrand?: string;
  identifiedModel?: string;
  confidence: number;
  reasoning: string;
  isSpecialty?: boolean;
  clarifications?: import("../types/domain.js").ClarificationQuestion[];
}

// Mock provider — returns suggestions based on existing item data
function mockIdentify(item: Item): IdentificationResult {
  const categoryMap: Record<string, { brand?: string; model?: string; confidence: number }> = {
    "Furniture": { brand: undefined, model: undefined, confidence: 0.7 },
    "Electronics": { brand: "Various", model: undefined, confidence: 0.6 },
    "Appliance": { brand: "Various", model: undefined, confidence: 0.65 },
    "Keepsake": { brand: undefined, model: undefined, confidence: 0.5 },
    "Media": { brand: undefined, model: undefined, confidence: 0.55 },
    "Linens": { brand: undefined, model: undefined, confidence: 0.6 },
    "Decor": { brand: undefined, model: undefined, confidence: 0.5 },
  };

  const catInfo = categoryMap[item.category] ?? { confidence: 0.4 };
  const hasPhoto = !!item.photoPath;
  const confidenceBoost = hasPhoto ? 0.15 : 0;

  return {
    identifiedName: item.itemName,
    identifiedCategory: item.category,
    identifiedBrand: catInfo.brand,
    identifiedModel: catInfo.model,
    confidence: Math.min(catInfo.confidence + confidenceBoost, 0.95),
    reasoning: hasPhoto
      ? `Identified based on item details and attached photo. Category "${item.category}" recognized with photo context.`
      : `Identified based on item name and category. No photo available — confidence is lower. Consider adding a photo for better results.`,
    isSpecialty: false,
    clarifications: [],
  };
}

export async function identifyItem(itemId: string): Promise<Item | null> {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  if (!row) return null;

  const currentItem = rowToItem(row as Record<string, unknown>);

  let result: IdentificationResult;

  if (isClaudeAvailable()) {
    // 1. Try Claude first
    const claudeResult = await claudeIdentify({
      itemName: currentItem.itemName,
      category: currentItem.category,
      condition: currentItem.condition,
      sizeClass: currentItem.sizeClass,
      photoPath: currentItem.photoPath,
      notes: currentItem.notes,
    });

    if (claudeResult) {
      result = claudeResult as IdentificationResult;
    } else if (isOpenAIAvailable()) {
      // 2. Claude failed — fall back to OpenAI
      const openaiResult = await openaiIdentify({
        itemName: currentItem.itemName,
        category: currentItem.category,
        condition: currentItem.condition,
        sizeClass: currentItem.sizeClass,
        photoPath: currentItem.photoPath,
        notes: currentItem.notes,
      });

      if (openaiResult) {
        result = openaiResult as IdentificationResult;
        result.reasoning = "[OpenAI] " + result.reasoning;
      } else {
        result = mockIdentify(currentItem);
        result.reasoning = "[Fallback] " + result.reasoning;
      }
    } else {
      // Claude failed, no OpenAI — use mock
      result = mockIdentify(currentItem);
      result.reasoning = "[Fallback] " + result.reasoning;
    }
  } else if (isOpenAIAvailable()) {
    // 2. Claude not configured — try OpenAI
    const openaiResult = await openaiIdentify({
      itemName: currentItem.itemName,
      category: currentItem.category,
      condition: currentItem.condition,
      sizeClass: currentItem.sizeClass,
      photoPath: currentItem.photoPath,
      notes: currentItem.notes,
    });

    if (openaiResult) {
      result = openaiResult as IdentificationResult;
      result.reasoning = "[OpenAI] " + result.reasoning;
    } else {
      result = mockIdentify(currentItem);
      result.reasoning = "[Fallback] " + result.reasoning;
    }
  } else {
    // 3. Neither Claude nor OpenAI available — use mock
    result = mockIdentify(currentItem);
    result.reasoning = "[Mock] " + result.reasoning;
  }

  const now = new Date().toISOString();

  // Serialize clarifications to JSON if present and non-empty
  const pendingClarificationsJson =
    result.clarifications && result.clarifications.length > 0
      ? JSON.stringify(result.clarifications)
      : null;

  db.prepare(`
    UPDATE items SET
      identifiedName = ?, identifiedCategory = ?, identifiedBrand = ?, identifiedModel = ?,
      identificationConfidence = ?, identificationReasoning = ?, identificationStatus = ?,
      pendingClarifications = ?,
      updatedAt = ?
    WHERE id = ?
  `).run(
    result.identifiedName,
    result.identifiedCategory,
    result.identifiedBrand ?? null,
    result.identifiedModel ?? null,
    result.confidence,
    result.reasoning,
    "SUGGESTED",
    pendingClarificationsJson,
    now,
    itemId,
  );

  const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  if (!updated) return null;
  return rowToItem(updated as Record<string, unknown>);
}

export function confirmIdentification(itemId: string, edits?: {
  identifiedName?: string;
  identifiedCategory?: string;
  identifiedBrand?: string;
  identifiedModel?: string;
}): Item | null {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  if (!row) return null;

  const now = new Date().toISOString();
  const status = edits ? "EDITED" : "CONFIRMED";

  if (edits) {
    const r = row as Record<string, unknown>;
    db.prepare(`
      UPDATE items SET
        identifiedName = COALESCE(?, identifiedName),
        identifiedCategory = COALESCE(?, identifiedCategory),
        identifiedBrand = ?,
        identifiedModel = ?,
        identificationStatus = ?,
        updatedAt = ?
      WHERE id = ?
    `).run(
      edits.identifiedName ?? (r.identifiedName as string | null) ?? null,
      edits.identifiedCategory ?? (r.identifiedCategory as string | null) ?? null,
      edits.identifiedBrand ?? (r.identifiedBrand as string | null) ?? null,
      edits.identifiedModel ?? (r.identifiedModel as string | null) ?? null,
      status,
      now,
      itemId,
    );
  } else {
    db.prepare("UPDATE items SET identificationStatus = ?, updatedAt = ? WHERE id = ?")
      .run(status, now, itemId);
  }

  const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  return updated ? rowToItem(updated as Record<string, unknown>) : null;
}
