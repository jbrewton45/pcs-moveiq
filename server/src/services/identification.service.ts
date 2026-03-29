import { query } from "../data/database.js";
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
  const result = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  if (result.rows.length === 0) return null;

  const currentItem = rowToItem(result.rows[0] as Record<string, unknown>);
  let identResult: IdentificationResult;

  if (isClaudeAvailable()) {
    const claudeResult = await claudeIdentify({
      itemName: currentItem.itemName,
      category: currentItem.category,
      condition: currentItem.condition,
      sizeClass: currentItem.sizeClass,
      photoPath: currentItem.photoPath,
      notes: currentItem.notes,
    });

    if (claudeResult) {
      identResult = claudeResult as IdentificationResult;
    } else if (isOpenAIAvailable()) {
      const openaiResult = await openaiIdentify({
        itemName: currentItem.itemName,
        category: currentItem.category,
        condition: currentItem.condition,
        sizeClass: currentItem.sizeClass,
        photoPath: currentItem.photoPath,
        notes: currentItem.notes,
      });
      if (openaiResult) {
        identResult = openaiResult as IdentificationResult;
        identResult.reasoning = "[OpenAI] " + identResult.reasoning;
      } else {
        identResult = mockIdentify(currentItem);
        identResult.reasoning = "[Fallback] " + identResult.reasoning;
      }
    } else {
      identResult = mockIdentify(currentItem);
      identResult.reasoning = "[Fallback] " + identResult.reasoning;
    }
  } else if (isOpenAIAvailable()) {
    const openaiResult = await openaiIdentify({
      itemName: currentItem.itemName,
      category: currentItem.category,
      condition: currentItem.condition,
      sizeClass: currentItem.sizeClass,
      photoPath: currentItem.photoPath,
      notes: currentItem.notes,
    });
    if (openaiResult) {
      identResult = openaiResult as IdentificationResult;
      identResult.reasoning = "[OpenAI] " + identResult.reasoning;
    } else {
      identResult = mockIdentify(currentItem);
      identResult.reasoning = "[Fallback] " + identResult.reasoning;
    }
  } else {
    identResult = mockIdentify(currentItem);
    identResult.reasoning = "[Mock] " + identResult.reasoning;
  }

  const now = new Date().toISOString();
  const pendingClarificationsJson =
    identResult.clarifications && identResult.clarifications.length > 0
      ? JSON.stringify(identResult.clarifications)
      : null;

  await query(
    `UPDATE items SET
      "identifiedName" = $1, "identifiedCategory" = $2, "identifiedBrand" = $3, "identifiedModel" = $4,
      "identificationConfidence" = $5, "identificationReasoning" = $6, "identificationStatus" = $7,
      "pendingClarifications" = $8, "updatedAt" = $9
     WHERE id = $10`,
    [
      identResult.identifiedName,
      identResult.identifiedCategory,
      identResult.identifiedBrand ?? null,
      identResult.identifiedModel ?? null,
      identResult.confidence,
      identResult.reasoning,
      "SUGGESTED",
      pendingClarificationsJson,
      now,
      itemId,
    ]
  );

  const updated = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  if (updated.rows.length === 0) return null;
  return rowToItem(updated.rows[0] as Record<string, unknown>);
}

export async function confirmIdentification(itemId: string, edits?: {
  identifiedName?: string;
  identifiedCategory?: string;
  identifiedBrand?: string;
  identifiedModel?: string;
}): Promise<Item | null> {
  const result = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  if (result.rows.length === 0) return null;

  const now = new Date().toISOString();
  const status = edits ? "EDITED" : "CONFIRMED";
  const r = result.rows[0] as Record<string, unknown>;

  if (edits) {
    await query(
      `UPDATE items SET
        "identifiedName" = COALESCE($1, "identifiedName"),
        "identifiedCategory" = COALESCE($2, "identifiedCategory"),
        "identifiedBrand" = $3,
        "identifiedModel" = $4,
        "identificationStatus" = $5,
        "updatedAt" = $6
       WHERE id = $7`,
      [
        edits.identifiedName ?? (r.identifiedName as string | null) ?? null,
        edits.identifiedCategory ?? (r.identifiedCategory as string | null) ?? null,
        edits.identifiedBrand ?? (r.identifiedBrand as string | null) ?? null,
        edits.identifiedModel ?? (r.identifiedModel as string | null) ?? null,
        status,
        now,
        itemId,
      ]
    );
  } else {
    await query(
      'UPDATE items SET "identificationStatus" = $1, "updatedAt" = $2 WHERE id = $3',
      [status, now, itemId]
    );
  }

  const updated = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  return updated.rows.length > 0 ? rowToItem(updated.rows[0] as Record<string, unknown>) : null;
}
