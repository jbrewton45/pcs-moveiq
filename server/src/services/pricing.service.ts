import { query } from "../data/database.js";
import type { Item, Comparable } from "../types/domain.js";
import type { ComparableCandidate, ComparableLookupInput } from "../types/providers.js";
import { rowToItem, rowToComparable } from "../utils/converters.js";
import { createId } from "../utils/id.js";
import { claudePricing, isClaudeAvailable } from "../providers/claude.provider.js";
import { openaiPricing, openaiWebSearchComparables, isOpenAIAvailable } from "../providers/openai.provider.js";
import { isEbayAvailable, ebayComparables } from "../providers/ebay.provider.js";
import { rederiveRecommendation } from "./items.service.js";
import { normalizeModel, applyPriceGuardrails } from "../utils/model-normalizer.js";
import { groupComparablesByConfig, generateConfigClarifications } from "../utils/comparable-config.js";

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
  const itemResult = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  if (itemResult.rows.length === 0) return null;
  const item = rowToItem(itemResult.rows[0] as Record<string, unknown>);

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

  async function runAIPricing(): Promise<PricingResult | null> {
    if (isClaudeAvailable()) {
      const r = await claudePricing(pricingInput);
      if (r) return r as PricingResult;
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

  const webSearchPromise: Promise<ComparableCandidate[] | null> = isOpenAIAvailable()
    ? openaiWebSearchComparables(lookupInput)
    : Promise.resolve(null);

  const [aiResult, ebayResult, webResult] = await Promise.all([runAIPricing(), ebayPromise, webSearchPromise]);

  const realComparables: ComparableCandidate[] = [
    ...(ebayResult ?? []),
    ...(webResult ?? []),
  ];

  const configResult = groupComparablesByConfig(
    realComparables,
    lookupInput.itemName,
    item.notes,
    lookupInput.category,
    clarificationAnswers,
  );
  const answersUsed = clarificationAnswers && Object.keys(clarificationAnswers).length > 0;

  const pricingComps = configResult.bestCluster.length > 0
    ? configResult.bestCluster
    : realComparables;

  const hasAI = aiResult != null;
  const hasRealComps = realComparables.length > 0;
  const now = new Date().toISOString();

  if (!hasAI && !hasRealComps) {
    await query(
      `UPDATE items SET
        "priceFastSale" = NULL, "priceFairMarket" = NULL, "priceReach" = NULL,
        "pricingConfidence" = NULL,
        "pricingReasoning" = $1,
        "pricingSuggestedChannel" = NULL, "pricingSaleSpeedBand" = NULL,
        "pricingLastUpdatedAt" = $2, "updatedAt" = $3
       WHERE id = $4`,
      [
        "Unable to estimate pricing. No AI providers responded and no comparable listings were found. Try again later, or add a photo and more details to improve results.",
        now, now, itemId,
      ]
    );
    await query('DELETE FROM comparables WHERE "itemId" = $1', [itemId]);
    await rederiveRecommendation(itemId);
    const finalResult = await query('SELECT * FROM items WHERE id = $1', [itemId]);
    return { item: rowToItem(finalResult.rows[0] as Record<string, unknown>), comparables: [] };
  }

  let result: PricingResult;

  if (hasAI) {
    result = aiResult!;
    const norm = normalizeModel(lookupInput.itemName, lookupInput.brand, lookupInput.model, lookupInput.category);
    if (norm) {
      result.fastSale = applyPriceGuardrails(result.fastSale, norm);
      result.fairMarket = applyPriceGuardrails(result.fairMarket, norm);
      result.reach = applyPriceGuardrails(result.reach, norm);
      result.confidence = Math.min(0.95, result.confidence + 0.1);
    }

    if (pricingComps.length >= 3) {
      const compPrices = pricingComps.map(c => c.price).sort((a, b) => a - b);
      const compMedian = compPrices[Math.floor(compPrices.length / 2)];
      const ratio = result.fairMarket / compMedian;
      if (ratio < 0.5 || ratio > 2.0) {
        result.fastSale = Math.round(compMedian * 0.7);
        result.fairMarket = Math.round(compMedian * 0.9);
        result.reach = Math.round(compMedian * 1.15);
        result.confidence = Math.min(result.confidence, 0.5);
        result.reasoning += " [Price adjusted: AI estimate diverged significantly from eBay comparable data]";
      }
    }

    if (configResult.adjustmentNote) {
      result.reasoning += ` [${configResult.adjustmentNote}]`;
    }
    if (answersUsed) {
      result.reasoning += " [Configuration refined by your answers]";
    }
    if (item.identificationConfidence != null) {
      result.confidence = Math.min(result.confidence, item.identificationConfidence + 0.2);
    }
  } else {
    const compPrices = pricingComps.map(c => c.price).sort((a, b) => a - b);
    const compMedian = compPrices[Math.floor(compPrices.length / 2)];
    const lowest = compPrices[0];
    const highest = compPrices[compPrices.length - 1];

    result = {
      fastSale: Math.round(lowest * 0.85),
      fairMarket: Math.round(compMedian),
      reach: Math.round(highest * 1.05),
      confidence: pricingComps.length >= 3 ? 0.6 : 0.4,
      reasoning: `Pricing derived from ${pricingComps.length} comparable listing${pricingComps.length > 1 ? "s" : ""}. No AI analysis was available.`,
      suggestedChannel: compMedian > 200 ? "Facebook Marketplace" : compMedian > 50 ? "Facebook Marketplace or OfferUp" : "Base Yard Sale or Nextdoor",
      saleSpeedBand: compMedian < 30 ? "FAST" : compMedian < 300 ? "MODERATE" : "SLOW",
      comparables: [],
    };

    if (configResult.adjustmentNote) {
      result.reasoning += ` [${configResult.adjustmentNote}]`;
    }
    if (answersUsed) {
      result.reasoning += " [Configuration refined by your answers]";
    }

    const norm = normalizeModel(lookupInput.itemName, lookupInput.brand, lookupInput.model, lookupInput.category);
    if (norm) {
      result.fastSale = applyPriceGuardrails(result.fastSale, norm);
      result.fairMarket = applyPriceGuardrails(result.fairMarket, norm);
      result.reach = applyPriceGuardrails(result.reach, norm);
      result.confidence = Math.min(0.95, result.confidence + 0.1);
    }
  }

  result.comparables = realComparables;

  await query(
    `UPDATE items SET
      "priceFastSale" = $1, "priceFairMarket" = $2, "priceReach" = $3,
      "pricingConfidence" = $4, "pricingReasoning" = $5,
      "pricingSuggestedChannel" = $6, "pricingSaleSpeedBand" = $7,
      "pricingLastUpdatedAt" = $8, "updatedAt" = $9
     WHERE id = $10`,
    [
      result.fastSale, result.fairMarket, result.reach,
      result.confidence, result.reasoning,
      result.suggestedChannel, result.saleSpeedBand,
      now, now, itemId,
    ]
  );

  await query('DELETE FROM comparables WHERE "itemId" = $1', [itemId]);

  const savedComps: Comparable[] = [];
  for (const comp of result.comparables) {
    const compId = createId("comp");
    await query(
      `INSERT INTO comparables (id, "itemId", title, source, url, "thumbnailUrl", price, "soldStatus", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [compId, itemId, comp.title, comp.source, comp.url ?? null, comp.thumbnailUrl ?? null, comp.price, comp.soldStatus ?? null, now]
    );
    savedComps.push({
      id: compId, itemId, title: comp.title, source: comp.source,
      url: comp.url, thumbnailUrl: comp.thumbnailUrl,
      price: comp.price, soldStatus: comp.soldStatus, createdAt: now,
    });
  }

  await rederiveRecommendation(itemId);

  if (!item.clarificationAnswers) {
    const configClarifications = generateConfigClarifications(
      lookupInput.itemName,
      item.notes,
      lookupInput.category,
      realComparables,
    );

    if (configClarifications.length > 0) {
      let existingClarifications: unknown[] = [];
      if (item.pendingClarifications) {
        try {
          const parsed = JSON.parse(item.pendingClarifications);
          if (Array.isArray(parsed)) existingClarifications = parsed;
        } catch { /* ignore */ }
      }

      const existingFields = new Set(
        existingClarifications
          .filter((q): q is { field: string } => typeof q === "object" && q !== null && "field" in q)
          .map(q => q.field),
      );
      const newClarifications = configClarifications.filter(q => !existingFields.has(q.field));

      if (newClarifications.length > 0) {
        const merged = [...existingClarifications, ...newClarifications];
        await query(
          'UPDATE items SET "pendingClarifications" = $1, "updatedAt" = $2 WHERE id = $3',
          [JSON.stringify(merged), now, itemId]
        );
      }
    }
  }

  const finalResult = await query('SELECT * FROM items WHERE id = $1', [itemId]);
  return { item: rowToItem(finalResult.rows[0] as Record<string, unknown>), comparables: savedComps };
}

export async function getItemComparables(itemId: string): Promise<Comparable[]> {
  const result = await query('SELECT * FROM comparables WHERE "itemId" = $1 ORDER BY "createdAt" DESC', [itemId]);
  return result.rows.map(r => rowToComparable(r as Record<string, unknown>));
}
