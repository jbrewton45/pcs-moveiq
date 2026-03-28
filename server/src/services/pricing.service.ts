import { db } from "../data/database.js";
import type { Item, Comparable } from "../types/domain.js";
import type { ComparableCandidate, ComparableLookupInput } from "../types/providers.js";
import { rowToItem, rowToComparable } from "../utils/converters.js";
import { createId } from "../utils/id.js";
import { claudePricing, isClaudeAvailable } from "../providers/claude.provider.js";
import { isEbayAvailable, ebayComparables } from "../providers/ebay.provider.js";
import { rederiveRecommendation } from "./items.service.js";

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

// Mock pricing provider based on item attributes
function mockPricing(item: Item): PricingResult {
  const categoryPricing: Record<string, { base: number; variance: number }> = {
    "Furniture": { base: 150, variance: 0.4 },
    "Electronics": { base: 100, variance: 0.5 },
    "Appliance": { base: 80, variance: 0.35 },
    "Media": { base: 20, variance: 0.3 },
    "Decor": { base: 40, variance: 0.45 },
    "Linens": { base: 15, variance: 0.3 },
    "Keepsake": { base: 30, variance: 0.6 },
  };

  const cat = item.identifiedCategory ?? item.category;
  const pricing = categoryPricing[cat] ?? { base: 50, variance: 0.4 };

  const conditionMultiplier: Record<string, number> = {
    "NEW": 1.5, "LIKE_NEW": 1.2, "GOOD": 1.0, "FAIR": 0.6, "POOR": 0.25,
  };
  const condMult = conditionMultiplier[item.condition] ?? 1.0;

  const sizeMultiplier: Record<string, number> = {
    "SMALL": 0.6, "MEDIUM": 1.0, "LARGE": 1.8, "OVERSIZED": 2.5,
  };
  const sizeMult = sizeMultiplier[item.sizeClass] ?? 1.0;

  const basePrice = Math.round(pricing.base * condMult * sizeMult);
  const fastSale = Math.round(basePrice * 0.6);
  const fairMarket = basePrice;
  const reach = Math.round(basePrice * 1.4);

  const hasIdentification = item.identificationStatus !== "NONE";
  const hasPhoto = !!item.photoPath;
  let confidence = 0.4;
  if (hasIdentification) confidence += 0.2;
  if (hasPhoto) confidence += 0.1;
  if (item.identifiedBrand) confidence += 0.1;
  confidence = Math.min(confidence, 0.9);

  const suggestedChannel = basePrice > 200
    ? "Facebook Marketplace"
    : basePrice > 50
    ? "Facebook Marketplace or OfferUp"
    : "Base Yard Sale or Nextdoor";

  const saleSpeedBand = basePrice < 30
    ? "FAST"
    : basePrice < 300
    ? "MODERATE"
    : "SLOW";

  // Generate mock comparables
  const comparables: ComparableCandidate[] = [];
  const itemName = item.identifiedName ?? item.itemName;
  const sources = ["Facebook Marketplace", "OfferUp", "Craigslist"];

  for (let i = 0; i < 3; i++) {
    const priceVariance = 1 + (Math.random() - 0.5) * pricing.variance * 2;
    const compPrice = Math.round(fairMarket * priceVariance);
    const sold = Math.random() > 0.5;
    comparables.push({
      title: `${itemName} - ${item.condition === "NEW" ? "New" : "Used"} ${cat}`,
      source: "mock",
      price: compPrice,
      soldStatus: sold ? "SOLD" : "LISTED",
    });
  }

  return {
    fastSale,
    fairMarket,
    reach,
    confidence,
    reasoning: `Pricing based on ${cat.toLowerCase()} in ${item.condition.toLowerCase()} condition (${item.sizeClass.toLowerCase()} size). ${hasIdentification ? "Item has been identified. " : "No identification — consider identifying for better accuracy. "}${hasPhoto ? "Photo available." : "No photo — pricing may be less accurate."}`,
    suggestedChannel,
    saleSpeedBand,
    comparables,
  };
}

export async function generatePricing(itemId: string): Promise<{ item: Item; comparables: Comparable[] } | null> {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  if (!row) return null;

  const item = rowToItem(row as Record<string, unknown>);

  // Build ComparableLookupInput for eBay — prefer identified fields when available
  const lookupInput: ComparableLookupInput = {
    itemName: item.identifiedName ?? item.itemName,
    category: item.identifiedCategory ?? item.category,
    condition: item.condition,
    brand: item.identifiedBrand,
    model: item.identifiedModel,
  };

  // Run primary pricing and eBay lookup concurrently
  const primaryPricingPromise: Promise<PricingResult | null> = isClaudeAvailable()
    ? claudePricing({
        itemName: lookupInput.itemName,
        category: lookupInput.category,
        condition: item.condition,
        sizeClass: item.sizeClass,
        brand: lookupInput.brand,
        model: lookupInput.model,
        notes: item.notes,
      })
    : Promise.resolve(null);

  const ebayPromise: Promise<ComparableCandidate[] | null> = isEbayAvailable()
    ? ebayComparables(lookupInput)
    : Promise.resolve(null);

  const [primaryResult, ebayResult] = await Promise.all([primaryPricingPromise, ebayPromise]);

  let result: PricingResult;

  if (isClaudeAvailable()) {
    if (primaryResult) {
      result = primaryResult as PricingResult;
    } else {
      result = mockPricing(item);
      result.reasoning = "[Fallback] " + result.reasoning;
    }
  } else {
    result = mockPricing(item);
    result.reasoning = "[Mock] " + result.reasoning;
  }

  // Merge comparables: primary first, then eBay results
  const allComparables: ComparableCandidate[] = [
    ...result.comparables,
    ...(ebayResult ?? []),
  ];
  result.comparables = allComparables;

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
    now, now, itemId
  );

  // Replace comparables for this item
  db.prepare("DELETE FROM comparables WHERE itemId = ?").run(itemId);

  const insertComp = db.prepare(`
    INSERT INTO comparables (id, itemId, title, source, url, thumbnailUrl, price, soldStatus, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const savedComps: Comparable[] = [];
  for (const comp of result.comparables) {
    const compId = createId("comp");
    insertComp.run(
      compId, itemId, comp.title, comp.source,
      comp.url ?? null, comp.thumbnailUrl ?? null,
      comp.price, comp.soldStatus ?? null, now
    );
    savedComps.push({
      id: compId,
      itemId,
      title: comp.title,
      source: comp.source,
      url: comp.url,
      thumbnailUrl: comp.thumbnailUrl,
      price: comp.price,
      soldStatus: comp.soldStatus,
      createdAt: now,
    });
  }

  // Re-derive recommendation with fresh pricing context
  rederiveRecommendation(itemId);

  const finalRow = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);
  const finalItem = rowToItem(finalRow as Record<string, unknown>);

  return { item: finalItem, comparables: savedComps };
}

export function getItemComparables(itemId: string): Comparable[] {
  const rows = db.prepare("SELECT * FROM comparables WHERE itemId = ? ORDER BY createdAt DESC").all(itemId);
  return rows.map(r => rowToComparable(r as Record<string, unknown>));
}
