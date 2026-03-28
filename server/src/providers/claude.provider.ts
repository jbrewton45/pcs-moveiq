import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { ComparableCandidate } from "../types/providers.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

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

interface IdentificationOutput {
  identifiedName: string;
  identifiedCategory: string;
  identifiedBrand?: string;
  identifiedModel?: string;
  confidence: number;
  reasoning: string;
}

export async function claudeIdentify(input: IdentificationInput): Promise<IdentificationOutput | null> {
  const api = getClient();
  if (!api) return null;

  try {
    const contentParts: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

    // Add photo if available
    if (input.photoPath) {
      const filePath = path.join(UPLOADS_DIR, input.photoPath);
      if (fs.existsSync(filePath)) {
        const imageData = fs.readFileSync(filePath);
        const base64 = imageData.toString("base64");
        const ext = path.extname(input.photoPath).toLowerCase();
        const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        contentParts.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
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

Please identify this item as precisely as possible. Return a JSON object with these fields:
{
  "identifiedName": "specific name of the item",
  "identifiedCategory": "refined category",
  "identifiedBrand": "brand if identifiable, or null",
  "identifiedModel": "model if identifiable, or null",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of your identification"
}

Rules:
- confidence should reflect how certain you are
- if no photo, confidence should generally be lower (0.3-0.6)
- with a clear photo, confidence can be higher (0.5-0.9)
- be honest about uncertainty
- return ONLY the JSON object, no other text`,
    });

    const response = await api.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: contentParts }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as IdentificationOutput;
    // Clamp confidence
    parsed.confidence = Math.max(0.1, Math.min(0.95, parsed.confidence));
    return parsed;
  } catch (err) {
    console.error("Claude identification failed:", err instanceof Error ? err.message : err);
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

    const response = await api.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `You are a pricing analyst for household items being sold during a military PCS move in the US.

Item: ${input.itemName}${brandInfo}${modelInfo}
Category: ${input.category}
Condition: ${input.condition}
Size: ${input.sizeClass}
${input.notes ? `Notes: ${input.notes}` : ""}

Estimate realistic resale prices in USD. Return a JSON object:
{
  "fastSale": number (price for a quick sale within 1-3 days),
  "fairMarket": number (fair price with 1-2 weeks of selling time),
  "reach": number (optimistic price if item is in demand),
  "confidence": 0.0 to 1.0 (how confident you are in these estimates),
  "reasoning": "brief explanation of your pricing logic",
  "suggestedChannel": "best selling channel (e.g. Facebook Marketplace, OfferUp, Base Yard Sale)",
  "saleSpeedBand": "FAST or MODERATE or SLOW",
  "comparables": [
    { "title": "similar item listing title", "source": "claude", "price": number, "soldStatus": "SOLD or LISTED" },
    { "title": "...", "source": "claude", "price": number, "soldStatus": "..." },
    { "title": "...", "source": "claude", "price": number, "soldStatus": "..." }
  ]
}

Rules:
- Prices should be realistic US resale prices
- comparables should be realistic examples of what similar items sell for
- confidence should be lower for generic items, higher for well-known branded items
- saleSpeedBand: FAST for items under $50, MODERATE for $50-300, SLOW for $300+
- Return ONLY the JSON object`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as PricingOutput;
    parsed.confidence = Math.max(0.1, Math.min(0.95, parsed.confidence));
    // Ensure prices are positive integers
    parsed.fastSale = Math.max(1, Math.round(parsed.fastSale));
    parsed.fairMarket = Math.max(1, Math.round(parsed.fairMarket));
    parsed.reach = Math.max(1, Math.round(parsed.reach));
    // Ensure all comparables have source: "claude"
    if (Array.isArray(parsed.comparables)) {
      parsed.comparables = parsed.comparables.map(c => ({ ...c, source: "claude" as const }));
    } else {
      parsed.comparables = [];
    }
    return parsed;
  } catch (err) {
    console.error("Claude pricing failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
