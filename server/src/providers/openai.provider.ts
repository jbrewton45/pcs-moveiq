import OpenAI from "openai";
import fs from "fs";
import path from "path";
import type { ComparableCandidate, ComparableLookupInput } from "../types/providers.js";
import type { ClarificationQuestion } from "../types/domain.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  client = new OpenAI({ apiKey });
  return client;
}

export function isOpenAIAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export interface IdentificationInput {
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
  clarifications?: ClarificationQuestion[];
}

export interface PricingInput {
  itemName: string;
  category: string;
  condition: string;
  sizeClass: string;
  brand?: string;
  model?: string;
  notes?: string;
  clarificationAnswers?: Record<string, string>;
}

export interface PricingOutput {
  fastSale: number;
  fairMarket: number;
  reach: number;
  confidence: number;
  reasoning: string;
  suggestedChannel: string;
  saleSpeedBand: string;
  comparables: ComparableCandidate[];
}

export async function openaiIdentify(input: IdentificationInput): Promise<IdentificationOutput | null> {
  const api = getClient();
  if (!api) return null;

  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Build user message content — support vision if photo provided
    const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = [];

    if (input.photoPath) {
      const filePath = path.join(UPLOADS_DIR, input.photoPath);
      if (fs.existsSync(filePath)) {
        const imageData = fs.readFileSync(filePath);
        const base64 = imageData.toString("base64");
        const ext = path.extname(input.photoPath).toLowerCase();
        const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        contentParts.push({
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64}`,
            detail: "low",
          },
        });
      }
    }

    contentParts.push({
      type: "text",
      text: `You are helping identify a household item for a military PCS (Permanent Change of Station) move.

Current item details:
- Name: ${input.itemName}
- Category: ${input.category}
- Condition: ${input.condition}
- Size: ${input.sizeClass}
${input.notes ? `- Notes: ${input.notes}` : ""}
${input.photoPath ? "A photo of the item is attached." : "No photo is available."}

Please identify this item as precisely as possible.

Specialty/high-value item detection: cameras (DSLRs, mirrorless), musical instruments (guitars, keyboards, violins), collectibles (trading cards, coins, art), power tools (drills, saws, compressors), designer items (handbags, watches), gaming consoles, premium appliances (KitchenAid, Vitamix, Dyson), premium exercise equipment (Peloton, NordicTrack) should all have isSpecialty: true.

Clarification questions: Generate 1-3 questions ONLY when a missing fact would materially change pricing by more than 20%. For example: asking if a camera lens is included, or if there is major cosmetic damage. Do NOT ask clarifying questions for common household items where condition already covers the key pricing factors.

Return a JSON object with these exact fields:
{
  "identifiedName": "specific name of the item",
  "identifiedCategory": "refined category",
  "identifiedBrand": "brand if identifiable, or null",
  "identifiedModel": "model if identifiable, or null",
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
  ]
}

Rules:
- confidence should reflect how certain you are
- if no photo, confidence should generally be lower (0.3-0.6)
- with a clear photo, confidence can be higher (0.5-0.9)
- be honest about uncertainty
- clarifications array should be empty [] when no questions are needed
- return ONLY the JSON object, no other text`,
    });

    messages.push({ role: "user", content: contentParts });

    const response = await api.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as IdentificationOutput;

    // Clamp confidence
    parsed.confidence = Math.max(0.1, Math.min(0.95, parsed.confidence));

    // Normalize clarifications — ensure it's an array
    if (!Array.isArray(parsed.clarifications)) {
      parsed.clarifications = [];
    }

    return parsed;
  } catch (err) {
    console.error("OpenAI identification failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function openaiPricing(input: PricingInput): Promise<PricingOutput | null> {
  const api = getClient();
  if (!api) return null;

  try {
    const brandInfo = input.brand ? ` by ${input.brand}` : "";
    const modelInfo = input.model ? ` (model: ${input.model})` : "";

    // Build clarification context if answers were provided
    let clarificationContext = "";
    if (input.clarificationAnswers && Object.keys(input.clarificationAnswers).length > 0) {
      const answerLines = Object.entries(input.clarificationAnswers)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");
      clarificationContext = `\nAdditional details provided by the seller:\n${answerLines}\n`;
    }

    // Emphasize model-specific pricing when brand + model are available
    const modelEmphasis =
      input.brand && input.model
        ? `\nIMPORTANT: Price this specific model (${input.brand} ${input.model}), not the generic category. Use known market prices for this exact model.`
        : "";

    const response = await api.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
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
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Omit<PricingOutput, "comparables"> & { comparables?: ComparableCandidate[] };

    // Clamp confidence
    parsed.confidence = Math.max(0.1, Math.min(0.95, parsed.confidence));

    // Ensure prices are positive integers
    parsed.fastSale = Math.max(1, Math.round(parsed.fastSale));
    parsed.fairMarket = Math.max(1, Math.round(parsed.fairMarket));
    parsed.reach = Math.max(1, Math.round(parsed.reach));

    // OpenAI must not generate fake comparable listings — comparables come from eBay only
    parsed.comparables = [];

    return parsed as PricingOutput;
  } catch (err) {
    console.error("OpenAI pricing failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Use OpenAI Responses API with web_search_preview to find real
 * comparable listings for an item on the used market.
 */
export async function openaiWebSearchComparables(
  input: ComparableLookupInput,
): Promise<ComparableCandidate[] | null> {
  const api = getClient();
  if (!api) return null;

  try {
    const searchTerms = input.brand && input.model
      ? `${input.brand} ${input.model}`
      : input.brand
      ? `${input.brand} ${input.itemName}`
      : input.itemName;

    const conditionText = input.condition.toLowerCase().replace("_", " ");

    const response = await api.responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: `Search for "${searchTerms}" used ${conditionText} for sale in the US. Find 5-8 real listings or recently sold items from sites like eBay, Facebook Marketplace, Mercari, Swappa, or other resale platforms.

For each listing found, extract:
- title: the listing title
- url: the actual URL of the listing
- price: the asking or sold price in USD (number only)
- soldStatus: "SOLD" if it already sold, "LISTED" if still available

Return ONLY a JSON array of objects. Example:
[
  {"title": "Sony A7R III Body Only - Used", "url": "https://www.ebay.com/itm/123", "price": 1050, "soldStatus": "SOLD"},
  {"title": "...", "url": "...", "price": 900, "soldStatus": "LISTED"}
]

Rules:
- Only include listings with real URLs you found in search results
- Only include listings where you can determine a price
- Prices must be in USD as numbers (no $ signs)
- Return ONLY the JSON array, nothing else`,
    });

    // Extract text from the response
    let text = "";
    for (const item of response.output) {
      if (item.type === "message") {
        for (const content of item.content) {
          if (content.type === "output_text") {
            text = content.text;
          }
        }
      }
    }

    if (!text) return null;

    // Parse JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title?: string;
      url?: string;
      price?: number;
      soldStatus?: string;
    }>;

    if (!Array.isArray(parsed)) return null;

    // Filter and normalize results
    const results: ComparableCandidate[] = [];
    for (const item of parsed) {
      const price = typeof item.price === "number" ? item.price : parseFloat(String(item.price));
      if (!item.title || isNaN(price) || price <= 0) continue;
      // Only include items with real URLs
      if (!item.url || !item.url.startsWith("http")) continue;
      results.push({
        title: item.title,
        source: "web",
        url: item.url,
        price: Math.round(price),
        soldStatus: item.soldStatus ?? "LISTED",
      });
    }

    return results.length > 0 ? results : null;
  } catch (err) {
    console.error("OpenAI web search failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
