import { z } from "zod/v4";
import { query } from "../data/database.js";
import type { Item } from "../types/domain.js";
import { rowToItem } from "../utils/converters.js";
import { claudeIdentify, isClaudeAvailable } from "../providers/claude.provider.js";
import { openaiIdentify, isOpenAIAvailable } from "../providers/openai.provider.js";
import { computeIdentificationQuality, isPricingEligible } from "../utils/identification-quality.js";
import { isItemCompleted } from "../services/items.service.js";

// ── Zod schema for provider output validation ───────────────────────────────

const ClarificationSchema = z.object({
  field: z.string().min(1),
  question: z.string().min(1),
  inputType: z.enum(["boolean", "text", "select"]),
  options: z.array(z.string()).optional(),
});

const ProviderOutputSchema = z.object({
  identifiedName: z.string().min(1),
  identifiedCategory: z.string().min(1),
  identifiedBrand: z.string().nullable().optional().transform(v => v || null),
  identifiedModel: z.string().nullable().optional().transform(v => v || null),
  confidence: z.number().transform(v => Math.max(0.1, Math.min(0.95, v))),
  reasoning: z.string().min(1),
  isSpecialty: z.boolean().optional().default(false),
  clarifications: z.array(ClarificationSchema).optional().default([]),
  likelyModelOptions: z.array(z.string().min(1)).max(6).nullable().optional(),
  requiresModelSelection: z.boolean().optional().default(false),
});

type ValidatedOutput = z.infer<typeof ProviderOutputSchema>;

function validateProviderOutput(raw: unknown): ValidatedOutput | null {
  const result = ProviderOutputSchema.safeParse(raw);
  if (!result.success) {
    console.warn("[identify] provider output failed validation:", result.error.issues.map(i => i.message).join("; "));
    return null;
  }
  return result.data;
}

// ── Internal result type (validated output + provider tag) ──────────────────

export type IdentificationProvider = "claude" | "openai" | "mock";

interface IdentificationResult extends ValidatedOutput {
  provider: IdentificationProvider;
}

// ── Mock provider (deterministic, no AI) ────────────────────────────────────

function mockIdentify(item: Item, reason: string): IdentificationResult {
  const categoryMap: Record<string, number> = {
    "Furniture": 0.3, "Electronics": 0.3, "Appliance": 0.3,
    "Keepsake": 0.2, "Media": 0.25, "Linens": 0.3, "Decor": 0.2,
  };
  const confidence = Math.min((categoryMap[item.category] ?? 0.2) + (item.photoPath ? 0.05 : 0), 0.3);

  return {
    identifiedName: item.itemName,
    identifiedCategory: item.category,
    identifiedBrand: null,
    identifiedModel: null,
    confidence,
    reasoning: reason,
    isSpecialty: false,
    clarifications: [],
    likelyModelOptions: null,
    requiresModelSelection: false,
    provider: "mock",
  };
}

// ── Main identification function ────────────────────────────────────────────

export interface IdentifyResult {
  item: Item;
  provider: IdentificationProvider;
  providerAvailable: boolean;
}

export async function identifyItem(itemId: string): Promise<IdentifyResult | null> {
  const result = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  if (result.rows.length === 0) return null;

  const currentItem = rowToItem(result.rows[0] as Record<string, unknown>);

  // Workstream F: completed items are finalized — do not re-identify.
  if (isItemCompleted(currentItem.status)) return null;

  const input = {
    itemName: currentItem.itemName,
    category: currentItem.category,
    condition: currentItem.condition,
    sizeClass: currentItem.sizeClass,
    photoPath: currentItem.photoPath,
    notes: currentItem.notes,
  };

  let identResult: IdentificationResult | null = null;

  // Cascade: Claude → OpenAI → Mock. Each provider's raw output is validated
  // before acceptance. Invalid output = null = cascade to next.
  if (isClaudeAvailable()) {
    const raw = await claudeIdentify(input);
    if (raw) {
      const validated = validateProviderOutput(raw);
      if (validated) identResult = { ...validated, provider: "claude" };
    }
  }

  if (!identResult && isOpenAIAvailable()) {
    const raw = await openaiIdentify(input);
    if (raw) {
      const validated = validateProviderOutput(raw);
      if (validated) identResult = { ...validated, provider: "openai" };
    }
  }

  if (!identResult) {
    const noKeysConfigured = !isClaudeAvailable() && !isOpenAIAvailable();
    const reason = noKeysConfigured
      ? "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY for accurate identification."
      : "AI providers failed. Result is an estimate only.";
    identResult = mockIdentify(currentItem, reason);
  }

  // Compute identification quality and pricing eligibility before persisting
  const identificationQuality = computeIdentificationQuality({
    identifiedName:     identResult.identifiedName,
    identifiedCategory: identResult.identifiedCategory,
    identifiedBrand:    identResult.identifiedBrand,
    identifiedModel:    identResult.identifiedModel,
    confidence:         identResult.confidence,
    provider:           identResult.provider,
  });
  const pricingEligible = isPricingEligible(identificationQuality);

  // Write to DB
  const now = new Date().toISOString();
  const pendingClarificationsJson =
    identResult.clarifications.length > 0
      ? JSON.stringify(identResult.clarifications)
      : null;

  const likelyJson = identResult.likelyModelOptions && identResult.likelyModelOptions.length > 0
    ? JSON.stringify(identResult.likelyModelOptions)
    : null;
  const requiresSel = !!identResult.requiresModelSelection;

  await query(
    `UPDATE items SET
      "identifiedName" = $1, "identifiedCategory" = $2, "identifiedBrand" = $3, "identifiedModel" = $4,
      "identificationConfidence" = $5, "identificationReasoning" = $6, "identificationStatus" = $7,
      "pendingClarifications" = $8, "identificationQuality" = $9, "pricingEligible" = $10,
      "likelyModelOptions" = $11, "requiresModelSelection" = $12,
      "updatedAt" = $13
     WHERE id = $14`,
    [
      identResult.identifiedName,
      identResult.identifiedCategory,
      identResult.identifiedBrand,
      identResult.identifiedModel,
      identResult.confidence,
      identResult.reasoning,
      "SUGGESTED",
      pendingClarificationsJson,
      identificationQuality,
      pricingEligible,
      likelyJson,
      requiresSel,
      now,
      itemId,
    ]
  );

  const updated = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  if (updated.rows.length === 0) return null;

  return {
    item: rowToItem(updated.rows[0] as Record<string, unknown>),
    provider: identResult.provider,
    providerAvailable: identResult.provider !== "mock",
  };
}

export async function confirmIdentification(itemId: string, edits?: {
  identifiedName?: string;
  identifiedCategory?: string;
  identifiedBrand?: string;
  identifiedModel?: string;
}): Promise<Item | null> {
  const result = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  if (result.rows.length === 0) return null;

  const loadedItem = rowToItem(result.rows[0] as Record<string, unknown>);

  // Workstream F: completed items are finalized — do not re-confirm identification.
  if (isItemCompleted(loadedItem.status)) return null;

  const now = new Date().toISOString();
  const status = edits ? "EDITED" : "CONFIRMED";
  const r = result.rows[0] as Record<string, unknown>;

  // A human confirmation or edit is explicit human judgment — always treat as STRONG quality.
  // This ensures pricing is never gated after a user explicitly signs off on the identification.
  const confirmedQuality: "STRONG" | "MEDIUM" | "WEAK" = "STRONG";
  const confirmedPricingEligible = true;

  if (edits) {
    await query(
      `UPDATE items SET
        "identifiedName" = COALESCE($1, "identifiedName"),
        "identifiedCategory" = COALESCE($2, "identifiedCategory"),
        "identifiedBrand" = $3,
        "identifiedModel" = $4,
        "identificationStatus" = $5,
        "identificationQuality" = $6,
        "pricingEligible" = $7,
        "likelyModelOptions" = NULL,
        "requiresModelSelection" = FALSE,
        "updatedAt" = $8
       WHERE id = $9`,
      [
        edits.identifiedName ?? (r.identifiedName as string | null) ?? null,
        edits.identifiedCategory ?? (r.identifiedCategory as string | null) ?? null,
        edits.identifiedBrand ?? (r.identifiedBrand as string | null) ?? null,
        edits.identifiedModel ?? (r.identifiedModel as string | null) ?? null,
        status,
        confirmedQuality,
        confirmedPricingEligible,
        now,
        itemId,
      ]
    );
  } else {
    await query(
      `UPDATE items SET
        "identificationStatus" = $1,
        "identificationQuality" = $2,
        "pricingEligible" = $3,
        "likelyModelOptions" = NULL,
        "requiresModelSelection" = FALSE,
        "updatedAt" = $4
       WHERE id = $5`,
      [status, confirmedQuality, confirmedPricingEligible, now, itemId]
    );
  }

  const updated = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  return updated.rows.length > 0 ? rowToItem(updated.rows[0] as Record<string, unknown>) : null;
}
