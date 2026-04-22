import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import type { ComparableCandidate } from "../types/providers.js";
import { getUploadsDir } from "../data/storage.js";
import { GENERIC_NAMES, isGenericName, isGenericCategory } from "../utils/identification-quality.js";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client = new Anthropic({ apiKey });
  return client;
}

export function isClaudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

interface IdentificationInput {
  itemName: string;
  category: string;
  condition: string;
  sizeClass: string;
  photoPath?: string;
  notes?: string;
}

export interface IdentificationOutput {
  identifiedName: string;
  identifiedCategory: string;
  identifiedBrand?: string;
  identifiedModel?: string;
  confidence: number;
  reasoning: string;
  isSpecialty?: boolean;
  clarifications?: Array<{
    field: string;
    question: string;
    inputType: "boolean" | "text" | "select";
    options?: string[];
  }>;
  likelyModelOptions?: string[] | null;
  requiresModelSelection?: boolean;
}

const IDENTIFY_TIMEOUT_MS = 30_000;
const PRICING_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 2_000;

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

async function callWithRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fn(controller.signal);
      return result;
    } catch (err) {
      if (attempt === 0 && isRetryable(err)) {
        console.warn(`[Claude] retryable error (attempt 1), retrying in ${RETRY_DELAY_MS}ms:`, err instanceof Error ? err.message : err);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("unreachable");
}

export async function claudeIdentify(input: IdentificationInput): Promise<IdentificationOutput | null> {
  const api = getClient();
  if (!api) return null;

  try {
    const contentParts: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

    if (input.photoPath) {
      const filePath = path.join(getUploadsDir(), input.photoPath);
      try {
        const imageData = await fs.readFile(filePath);
        const base64 = imageData.toString("base64");
        const ext = path.extname(input.photoPath).toLowerCase();
        const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        contentParts.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        });
      } catch {
        console.warn(`[Claude] photo not found: ${filePath}, proceeding text-only`);
      }
    }

    contentParts.push({
      type: "text",
      text: `You are helping identify a household item for a military PCS (Permanent Change of Station) move.

Seller-provided context (MAY BE PLACEHOLDERS):
- Name: ${input.itemName}
- Category: ${input.category}
- Condition: ${input.condition}
- Size: ${input.sizeClass}
${input.notes ? `- Notes: ${input.notes}` : ""}
${input.photoPath ? "A photo of the item is attached." : "No photo is available."}

IMPORTANT: The "Name" and "Category" above may be auto-generated placeholders from a room scan (for example, "Scanned Item" or "Uncategorized"). IGNORE those placeholder values entirely and identify the item from the photo and notes. Do not echo the placeholder back as your answer.

IDENTIFICATION REQUIREMENTS

identifiedName: Describe what the item actually is, using the item type plus at least one distinguishing attribute (brand, material, color, form factor, or use). Good examples:
- "Ryobi 18V cordless fan"
- "KitchenAid stand mixer"
- "IKEA Malm 6-drawer dresser"
- "Sony A7R III mirrorless camera body"
When brand is not visible, a generic-but-specific type is acceptable:
- "cordless drill"
- "upholstered loveseat"
- "gas-powered leaf blower"

FORBIDDEN identifiedName values (case-insensitive, never return any of these): "Scanned Item", "Item", "Unknown Item", "Uncategorized", "Object", "Misc", "Household Item". If you truly cannot tell what the item is, return a best-effort generic type like "unidentified small appliance", "unidentified piece of furniture", or "unidentified kitchen tool" with a LOW confidence value (around 0.2). NEVER return a placeholder name.

identifiedCategory: Must be exactly one of this fixed list (pick the best fit):
Furniture, Electronics, Appliance, Kitchen, Tools, Sporting Goods, Outdoor, Toys, Clothing, Decor, Media, Linens, Baby, Pet, Office, Other.
Do NOT return "Uncategorized".

identifiedBrand / identifiedModel: Fill ONLY if you can actually read the brand or model on the item (logo, nameplate, sticker, product casing). If not visible, return null. Do NOT guess a brand or model from appearance alone.

Confidence bands (be honest):
- >= 0.75 (STRONG): Clear photo AND either brand/model is visible on the item OR the item is universally recognizable (e.g., a standard IKEA bookshelf, a well-known gaming console).
- 0.50 - 0.75 (MEDIUM): Confident on type and category, but brand/model uncertain, or the photo shows only part of the item.
- < 0.50 (WEAK): No photo, blurry photo, or only a generic guess possible. Use ~0.2 for an "unidentified <type>" fallback.

Specialty/high-value item detection: cameras (DSLRs, mirrorless), musical instruments (guitars, keyboards, violins), collectibles (trading cards, coins, art), power tools (drills, saws, compressors), designer items (handbags, watches), gaming consoles, premium appliances (KitchenAid, Vitamix, Dyson), premium exercise equipment (Peloton, NordicTrack) should all have isSpecialty: true.

Clarification questions: Generate 1-3 questions ONLY when a missing fact would materially change pricing by more than 20%. Do NOT ask clarifying questions for common household items.

### Model disambiguation (NEW — likelyModelOptions + requiresModelSelection)

Set \`requiresModelSelection: true\` ONLY when ALL three hold:
1. identifiedBrand is present and specific.
2. identifiedName describes a recognizable product family (e.g. contains "case", "impact driver", "drill", "circular saw", "fan", "headphones", "blender", "stand mixer", "vacuum", "speaker", "monitor").
3. identifiedModel is null OR is a generic family token (e.g. "Air", "Pro", "Elite"), NOT a specific SKU.

When \`requiresModelSelection: true\`, also return \`likelyModelOptions\` as 3-6 likely specific model strings from the brand's product line, PLUS the literal string "Other" appended LAST. Use short model numbers when possible (e.g. "1535", not "Pelican Air 1535 Wheeled Hard Case"). "Other" must never appear first.

When in doubt, return \`requiresModelSelection: false\` and omit/empty the list. Do NOT fabricate models.

Examples:
- Pelican Air hard case -> likelyModelOptions: ["1535","1595","1607","1615","1637","Other"], requiresModelSelection: true
- DeWalt 20V MAX impact driver -> ["DCF787","DCF809","DCF850","DCF845","Other"], true
- Sony over-ear noise-cancelling headphones -> ["WH-1000XM4","WH-1000XM5","WH-CH720N","Other"], true
- KitchenAid tilt-head stand mixer -> ["Artisan 5-Qt (KSM150)","Classic (K45SS)","Professional 5 Plus (KV25G0X)","Other"], true
- Generic office chair, no brand visible -> requiresModelSelection: false, likelyModelOptions: []
- DeWalt DCF850 (model stamped on tool) -> requiresModelSelection: false (model is already specific)
- Generic wooden dining table -> requiresModelSelection: false

Return a JSON object with these exact fields and no other text:
{
  "identifiedName": "specific name of the item (never a forbidden placeholder)",
  "identifiedCategory": "one of: Furniture, Electronics, Appliance, Kitchen, Tools, Sporting Goods, Outdoor, Toys, Clothing, Decor, Media, Linens, Baby, Pet, Office, Other",
  "identifiedBrand": "brand only if visibly readable on the item, else null",
  "identifiedModel": "model only if visibly readable on the item, else null",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of your identification",
  "isSpecialty": true or false,
  "clarifications": [
    {
      "field": "shortCamelCaseKey",
      "question": "Human-readable question?",
      "inputType": "boolean" or "text" or "select",
      "options": ["Option A", "Option B"] or null
    }
  ],
  "likelyModelOptions": ["ModelA","ModelB","Other"] or null,
  "requiresModelSelection": true or false
}

Return ONLY the JSON object. No prose, no markdown fences.`,
    });

    const response = await callWithRetry(
      (signal) => api.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [{ role: "user", content: contentParts }],
      }, { signal }),
      IDENTIFY_TIMEOUT_MS,
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as IdentificationOutput;
    parsed.confidence = Math.max(0.1, Math.min(0.95, parsed.confidence));
    if (!Array.isArray(parsed.clarifications)) parsed.clarifications = [];
    if (typeof parsed.isSpecialty !== "boolean") parsed.isSpecialty = false;

    // Post-parse defense: guard against forbidden/generic placeholder names.
    // The prompt forbids these, but if the model still returns one, rewrite it
    // into a low-confidence best-effort generic rather than polluting the
    // downstream pricing pipeline with "Scanned Item" etc.
    if (isGenericName(parsed.identifiedName)) {
      console.warn(
        `[Claude] generic identifiedName "${parsed.identifiedName}" returned despite prompt guardrails; rewriting to unidentified fallback. Blocklist: ${GENERIC_NAMES.join(", ")}`,
      );
      const categoryHint = parsed.identifiedCategory?.toLowerCase().trim() || "item";
      parsed.identifiedName = `unidentified ${categoryHint}`;
      parsed.confidence = Math.min(parsed.confidence, 0.3);
    }

    if (isGenericCategory(parsed.identifiedCategory)) {
      console.warn(
        `[Claude] generic identifiedCategory "${parsed.identifiedCategory}" returned; leaving as-is for downstream quality gating (Workstream C).`,
      );
    }

    // Normalize likelyModelOptions / requiresModelSelection (Workstream K).
    if (Array.isArray(parsed.likelyModelOptions)) {
      // De-duplicate (case-insensitive), preserve order, cap at 6.
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const opt of parsed.likelyModelOptions) {
        const t = typeof opt === "string" ? opt.trim() : "";
        if (!t) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(t);
        if (deduped.length >= 6) break;
      }
      // Ensure "Other" is last when requiresModelSelection is true.
      const otherIdx = deduped.findIndex(s => s.toLowerCase() === "other");
      if (parsed.requiresModelSelection) {
        if (otherIdx >= 0 && otherIdx !== deduped.length - 1) {
          const [other] = deduped.splice(otherIdx, 1);
          deduped.push(other);
        } else if (otherIdx < 0) {
          // Always ensure an "Other" escape hatch. If full, drop the last
          // specific candidate to make room.
          if (deduped.length >= 6) deduped.pop();
          deduped.push("Other");
        }
      }
      parsed.likelyModelOptions = deduped.length ? deduped : null;
    } else {
      parsed.likelyModelOptions = null;
    }

    // Coerce requiresModelSelection=false if fewer than 2 options, or if specific model is already identified.
    const specificModelSet =
      typeof parsed.identifiedModel === "string" &&
      parsed.identifiedModel.trim().length > 0 &&
      // If the identified model exactly matches one of the options, disambiguation is resolved.
      (parsed.likelyModelOptions?.some(o => o.trim().toLowerCase() === parsed.identifiedModel!.trim().toLowerCase()) ?? false);

    if (
      parsed.requiresModelSelection &&
      ((parsed.likelyModelOptions?.length ?? 0) < 2 || specificModelSet)
    ) {
      parsed.requiresModelSelection = false;
      if ((parsed.likelyModelOptions?.length ?? 0) < 2) parsed.likelyModelOptions = null;
    }

    return parsed;
  } catch (err) {
    console.error("[Claude] identification failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

interface PricingInput {
  itemName: string;
  category: string;
  condition: string;
  sizeClass: string;
  brand?: string;
  model?: string;
  notes?: string;
  clarificationAnswers?: Record<string, string>;
}

interface PricingOutput {
  fastSale: number;
  fairMarket: number;
  reach: number;
  confidence: number;
  reasoning: string;
  suggestedChannel: string;
  saleSpeedBand: string;
  comparables: ComparableCandidate[];
}

export async function claudePricing(input: PricingInput): Promise<PricingOutput | null> {
  const api = getClient();
  if (!api) return null;

  try {
    const brandInfo = input.brand ? ` by ${input.brand}` : "";
    const modelInfo = input.model ? ` (model: ${input.model})` : "";

    const modelEmphasis =
      input.brand && input.model
        ? `\nIMPORTANT: Price this specific model (${input.brand} ${input.model}), not the generic category. Use known market prices for this exact model.\nIf the item appears to include accessories, a bundle, or a full kit, note this in your reasoning. Price the specific configuration described, not just the base unit.`
        : "\nIf the item appears to include accessories, a bundle, or a full kit, note this in your reasoning. Price the specific configuration described, not just the base unit.";

    let clarificationContext = "";
    if (input.clarificationAnswers && Object.keys(input.clarificationAnswers).length > 0) {
      const answerLines = Object.entries(input.clarificationAnswers)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");
      clarificationContext = `\nAdditional details provided by the seller:\n${answerLines}\n`;
    }

    const response = await callWithRetry(
      (signal) => api.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are a pricing analyst for household items being sold during a military PCS move in the US.

Item: ${input.itemName}${brandInfo}${modelInfo}
Category: ${input.category}
Condition: ${input.condition}
Size: ${input.sizeClass}
${input.notes ? `Notes: ${input.notes}` : ""}${clarificationContext}${modelEmphasis}

Estimate realistic resale prices in USD based on your knowledge of the US secondhand market. Return a JSON object:
{
  "fastSale": number (price for a quick sale within 1-3 days),
  "fairMarket": number (fair price with 1-2 weeks of selling time),
  "reach": number (optimistic price if item is in demand),
  "confidence": 0.0 to 1.0 (how confident you are in these estimates),
  "reasoning": "brief explanation of your pricing logic",
  "suggestedChannel": "best selling channel (e.g. Facebook Marketplace, OfferUp, Base Yard Sale)",
  "saleSpeedBand": "FAST or MODERATE or SLOW"
}

Rules:
- Prices should be realistic US resale prices based on your training data
- confidence should be lower for generic items, higher for well-known branded items
- saleSpeedBand: FAST for items under $50, MODERATE for $50-300, SLOW for $300+
- Return ONLY the JSON object`,
        }],
      }, { signal }),
      PRICING_TIMEOUT_MS,
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Omit<PricingOutput, "comparables"> & { comparables?: ComparableCandidate[] };
    parsed.confidence = Math.max(0.1, Math.min(0.95, parsed.confidence));
    parsed.fastSale = Math.max(1, Math.round(parsed.fastSale));
    parsed.fairMarket = Math.max(1, Math.round(parsed.fairMarket));
    parsed.reach = Math.max(1, Math.round(parsed.reach));
    parsed.comparables = [];
    return parsed as PricingOutput;
  } catch (err) {
    console.error("[Claude] pricing failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
