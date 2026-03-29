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

// Mock provider — returns unverified suggestions based on existing item data only.
// Used only when no AI provider is configured or as a last-resort fallback.
function mockIdentify(item: Item): IdentificationResult {
  const categoryMap: Record<string, { brand?: string; model?: string; confidence: number }> = {
    "Furniture": { brand: undefined, model: undefined, confidence: 0.3 },
    "Electronics": { brand: "Various", model: undefined, confidence: 0.3 },
    "Appliance": { brand: "Various", model: undefined, confidence: 0.3 },
    "Keepsake": { brand: undefined, model: undefined, confidence: 0.2 },
    "Media": { brand: undefined, model: undefined, confidence: 0.25 },
    "Linens": { brand: undefined, model: undefined, confidence: 0.3 },
    "Decor": { brand: undefined, model: undefined, confidence: 0.2 },
  };

  const catInfo = categoryMap[item.category] ?? { confidence: 0.2 };
  const hasPhoto = !!item.photoPath;
  // Modest boost for having a photo, but cap well below AI-level confidence
  const confidenceBoost = hasPhoto ? 0.05 : 0;

  return {
    identifiedName: item.itemName,
    identifiedCategory: item.category,
    identifiedBrand: catInfo.brand,
    identifiedModel: catInfo.model,
    confidence: Math.min(catInfo.confidence + confidenceBoost, 0.3),
    reasoning: "This is an unverified estimate based on the item name and category. For accurate identification, ensure an AI provider (Claude or OpenAI) is configured.",
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
