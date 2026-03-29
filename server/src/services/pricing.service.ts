import { db } from "../data/database.js";
import type { Item, Comparable } from "../types/domain.js";
import type { ComparableCandidate, ComparableLookupInput } from "../types/providers.js";
import { rowToItem, rowToComparable } from "../utils/converters.js";
import { createId } from "../utils/id.js";
import { claudePricing, isClaudeAvailable } from "../providers/claude.provider.js";
import { openaiPricing, isOpenAIAvailable } from "../providers/openai.provider.js";
import { isEbayAvailable, ebayComparables } from "../providers/ebay.provider.js";
import { rederiveRecommendation } from "./items.service.js";
import { normalizeModel, applyPriceGuardrails } from "../utils/model-normalizer.js";

interface PricingResult {
  fastSale: number;
  fairMarket: number;
  reach: number;
  confidence: number;
  reasoning: string;
  suggestedChannel: string;
  saleSpeedBand: string;
  comparables: ComparableCandidate[];
}

export async function generatePricing(itemId: string): Promise<{ item: Item; comparables: Comparable[] } | null> {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  if (!row) return null;
  const item = rowToItem(row as Record<string, unknown>);

  const lookupInput: ComparableLookupInput = {
    itemName: item.identifiedName ?? item.itemName,
    category: item.identifiedCategory ?? item.category,
    condition: item.condition,
    brand: item.identifiedBrand,
    model: item.identifiedModel,
  };

  let clarificationAnswers: Record<string, string> | undefined;
  if (item.clarificationAnswers) {
    try { clarificationAnswers = JSON.parse(item.clarificationAnswers); } catch { /* ignore */ }
  }

  const pricingInput = {
    itemName: lookupInput.itemName,
    category: lookupInput.category,
    condition: item.condition,
    sizeClass: item.sizeClass,
    brand: lookupInput.brand,
    model: lookupInput.model,
    notes: item.notes,
    clarificationAnswers,
  };

  // Run AI pricing and eBay lookup concurrently
  async function runAIPricing(): Promise<PricingResult | null> {
    if (isClaudeAvailable()) {
      const r = await claudePricing(pricingInput);
      if (r) return r as PricingResult;
      // Claude failed, try OpenAI
      if (isOpenAIAvailable()) {
        const o = await openaiPricing(pricingInput);
        if (o) { const rr = o as PricingResult; rr.reasoning = "[OpenAI] " + rr.reasoning; return rr; }
      }
      return null;
    }
    if (isOpenAIAvailable()) {
      const o = await openaiPricing(pricingInput);
      if (o) { const rr = o as PricingResult; rr.reasoning = "[OpenAI] " + rr.reasoning; return rr; }
    }
    return null;
  }

  const ebayPromise: Promise<ComparableCandidate[] | null> = isEbayAvailable()
    ? ebayComparables(lookupInput)
    : Promise.resolve(null);

  const [aiResult, ebayResult] = await Promise.all([runAIPricing(), ebayPromise]);

  // Only eBay comparables are real source-backed data
  const realComparables: ComparableCandidate[] = ebayResult ?? [];

  // Determine if we have enough evidence to provide pricing
  const hasAI = aiResult != null;
  const hasRealComps = realComparables.length > 0;

  if (!hasAI && !hasRealComps) {
    // NO evidence at all — write "no estimate" to DB and return
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE items SET
        priceFastSale = NULL, priceFairMarket = NULL, priceReach = NULL,
        pricingConfidence = NULL,
        pricingReasoning = ?,
        pricingSuggestedChannel = NULL, pricingSaleSpeedBand = NULL,
        pricingLastUpdatedAt = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      "Unable to estimate pricing. No AI providers responded and no comparable listings were found. Try again later, or add a photo and more details to improve results.",
      now, now, itemId,
    );
    db.prepare("DELETE FROM comparables WHERE itemId = ?").run(itemId);
    rederiveRecommendation(itemId);
    const finalRow = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
    return { item: rowToItem(finalRow as Record<string, unknown>), comparables: [] };
  }

  let result: PricingResult;

  if (hasAI) {
    result = aiResult!;
    // Apply model guardrails
    const norm = normalizeModel(lookupInput.itemName, lookupInput.brand, lookupInput.model, lookupInput.category);
    if (norm) {
      result.fastSale = applyPriceGuardrails(result.fastSale, norm);
      result.fairMarket = applyPriceGuardrails(result.fairMarket, norm);
      result.reach = applyPriceGuardrails(result.reach, norm);
      result.confidence = Math.min(0.95, result.confidence + 0.1);
    }

    // Cross-validate with eBay if we have enough comps
    if (realComparables.length >= 3) {
      const ebayPrices = realComparables.map(c => c.price).sort((a, b) => a - b);
      const ebayMedian = ebayPrices[Math.floor(ebayPrices.length / 2)];
      const ratio = result.fairMarket / ebayMedian;
      if (ratio < 0.5 || ratio > 2.0) {
        // AI price wildly off from eBay data — adjust toward eBay
        result.fastSale = Math.round(ebayMedian * 0.7);
        result.fairMarket = Math.round(ebayMedian * 0.9);
        result.reach = Math.round(ebayMedian * 1.15);
        result.confidence = Math.min(result.confidence, 0.5);
        result.reasoning += " [Price adjusted: AI estimate diverged significantly from eBay comparable data]";
      }
    }

    // Cap pricing confidence by identification confidence
    if (item.identificationConfidence != null) {
      result.confidence = Math.min(result.confidence, item.identificationConfidence + 0.2);
    }
  } else {
    // No AI, but we have eBay comparables — derive pricing purely from comps
    const ebayPrices = realComparables.map(c => c.price).sort((a, b) => a - b);
    const ebayMedian = ebayPrices[Math.floor(ebayPrices.length / 2)];
    const lowest = ebayPrices[0];
    const highest = ebayPrices[ebayPrices.length - 1];

    result = {
      fastSale: Math.round(lowest * 0.85),
      fairMarket: Math.round(ebayMedian),
      reach: Math.round(highest * 1.05),
      confidence: realComparables.length >= 3 ? 0.6 : 0.4,
      reasoning: `Pricing derived from ${realComparables.length} eBay comparable listing${realComparables.length > 1 ? "s" : ""}. No AI analysis was available.`,
      suggestedChannel: ebayMedian > 200 ? "Facebook Marketplace" : ebayMedian > 50 ? "Facebook Marketplace or OfferUp" : "Base Yard Sale or Nextdoor",
      saleSpeedBand: ebayMedian < 30 ? "FAST" : ebayMedian < 300 ? "MODERATE" : "SLOW",
      comparables: [], // we only use realComparables below
    };

    // Apply model guardrails
    const norm = normalizeModel(lookupInput.itemName, lookupInput.brand, lookupInput.model, lookupInput.category);
    if (norm) {
      result.fastSale = applyPriceGuardrails(result.fastSale, norm);
      result.fairMarket = applyPriceGuardrails(result.fairMarket, norm);
      result.reach = applyPriceGuardrails(result.reach, norm);
      result.confidence = Math.min(0.95, result.confidence + 0.1);
    }
  }

  // Only save real comparables (eBay)
  result.comparables = realComparables;

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE items SET
      priceFastSale = ?, priceFairMarket = ?, priceReach = ?,
      pricingConfidence = ?, pricingReasoning = ?,
      pricingSuggestedChannel = ?, pricingSaleSpeedBand = ?,
      pricingLastUpdatedAt = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    result.fastSale, result.fairMarket, result.reach,
    result.confidence, result.reasoning,
    result.suggestedChannel, result.saleSpeedBand,
    now, now, itemId,
  );

  // Replace comparables for this item — only real ones
  db.prepare("DELETE FROM comparables WHERE itemId = ?").run(itemId);

  const insertComp = db.prepare(`
    INSERT INTO comparables (id, itemId, title, source, url, thumbnailUrl, price, soldStatus, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const savedComps: Comparable[] = [];
  for (const comp of result.comparables) {
    const compId = createId("comp");
    insertComp.run(compId, itemId, comp.title, comp.source, comp.url ?? null, comp.thumbnailUrl ?? null, comp.price, comp.soldStatus ?? null, now);
    savedComps.push({
      id: compId, itemId, title: comp.title, source: comp.source,
      url: comp.url, thumbnailUrl: comp.thumbnailUrl,
      price: comp.price, soldStatus: comp.soldStatus, createdAt: now,
    });
  }

  rederiveRecommendation(itemId);

  const finalRow = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  return { item: rowToItem(finalRow as Record<string, unknown>), comparables: savedComps };
}

export function getItemComparables(itemId: string): Comparable[] {
  const rows = db.prepare("SELECT * FROM comparables WHERE itemId = ? ORDER BY createdAt DESC").all(itemId);
  return rows.map(r => rowToComparable(r as Record<string, unknown>));
}
