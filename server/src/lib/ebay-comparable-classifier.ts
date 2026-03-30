import type { EbaySearchResult } from "../services/ebay-search.service.js";
import type {
  AnalyzedListing,
  ListingClass,
  ComparableGroup,
  ExclusionSummary,
} from "../types/ebay-analysis.types.js";
import { parseTitle, normalizeQuery, titleMatchesQuery } from "./ebay-title-parser.js";
import {
  computePriceStats,
  removeOutliers,
  derivePricingTiers,
  computeGroupConfidence,
} from "./ebay-price-stats.js";

/**
 * Classify a single listing against a normalized query.
 */
export function classifyListing(
  item: EbaySearchResult,
  normalizedQ: string,
): AnalyzedListing {
  const parsed = parseTitle(item.title);
  const matchesQuery = titleMatchesQuery(parsed, normalizedQ);
  const flags: string[] = [];

  // Determine listing class
  let listingClass: ListingClass = "core_match";
  let relevanceScore = 1.0;

  if (parsed.flags.isPartsRepair) {
    listingClass = "parts_repair";
    relevanceScore = 0.1;
    flags.push("parts_repair");
  } else if (parsed.flags.isAccessoryOnly) {
    listingClass = "accessory_only";
    relevanceScore = 0.1;
    flags.push("accessory_only");
  } else if (!matchesQuery) {
    listingClass = "wrong_variant";
    relevanceScore = 0.2;
    flags.push("query_mismatch");
  } else if (parsed.flags.isBundleLikely || parsed.flags.hasMultipleItems) {
    listingClass = "bundle";
    relevanceScore = 0.6;
    flags.push("bundle_detected");
  } else if (parsed.flags.hasAccessoryMention || parsed.flags.hasLens) {
    listingClass = "core_with_accessory";
    relevanceScore = 0.8;
    if (parsed.flags.hasLens) flags.push("lens_included");
    if (parsed.flags.hasAccessoryMention) flags.push("accessories_included");
  } else if (parsed.flags.isBaseUnit) {
    listingClass = "core_match";
    relevanceScore = 1.0;
    flags.push("base_unit_confirmed");
  } else {
    // Default: treat as core match if query tokens matched
    listingClass = "core_match";
    relevanceScore = 0.9;
  }

  // Noise penalty
  if (parsed.flags.noise.length > 3) {
    relevanceScore = Math.max(relevanceScore - 0.1, 0);
    flags.push("high_noise");
  }

  // Condition flag
  if (parsed.flags.hasConditionNote) {
    flags.push("condition_noted");
  }

  // Config tier mapping
  const configTier =
    listingClass === "bundle" ? "bundle" as const :
    listingClass === "core_with_accessory" ? "base_plus" as const :
    (listingClass === "core_match" && parsed.flags.isBaseUnit) ? "base" as const :
    listingClass === "core_match" ? "base" as const :
    "base" as const;

  return {
    itemId: item.itemId,
    title: item.title,
    price: item.price ?? 0,
    currency: item.currency,
    condition: item.condition,
    itemWebUrl: item.itemWebUrl,
    imageUrl: item.imageUrl,
    sellerUsername: item.sellerUsername,
    shippingCost: item.shippingCost,
    itemLocation: item.itemLocation,
    classification: {
      listingClass,
      relevanceScore: Math.round(relevanceScore * 100) / 100,
      configTier,
      flags,
    },
  };
}

// Classes that should be excluded from core pricing
const EXCLUDED_CLASSES: Set<ListingClass> = new Set([
  "accessory_only",
  "parts_repair",
  "wrong_variant",
  "noise",
]);

/**
 * Group classified listings into comparable groups with pricing.
 */
export function groupAndPriceListings(
  listings: AnalyzedListing[],
  totalFetched: number,
): { groups: ComparableGroup[]; excluded: ExclusionSummary } {
  // Separate included vs excluded
  const included: AnalyzedListing[] = [];
  const excludedItems: AnalyzedListing[] = [];
  const excludeReasons = new Set<string>();

  for (const item of listings) {
    if (item.price <= 0) {
      excludedItems.push(item);
      excludeReasons.add("no_valid_price");
      continue;
    }
    if (EXCLUDED_CLASSES.has(item.classification.listingClass)) {
      excludedItems.push(item);
      for (const flag of item.classification.flags) {
        excludeReasons.add(flag);
      }
      continue;
    }
    included.push(item);
  }

  // Group included items by config tier
  const tierGroups = new Map<string, AnalyzedListing[]>();
  for (const item of included) {
    const key = item.classification.configTier;
    if (!tierGroups.has(key)) tierGroups.set(key, []);
    tierGroups.get(key)!.push(item);
  }

  const TIER_LABELS: Record<string, string> = {
    base: "Base Unit",
    base_plus: "With Accessories",
    bundle: "Bundle / Kit",
    full_kit: "Full Kit / Setup",
  };

  const groups: ComparableGroup[] = [];

  for (const [tierKey, items] of tierGroups) {
    const rawPrices = items.map(i => i.price);
    const cleanPrices = removeOutliers(rawPrices);

    // Track items excluded as outliers
    const outlierCount = rawPrices.length - cleanPrices.length;
    if (outlierCount > 0) {
      excludeReasons.add("price_outlier");
    }

    const stats = computePriceStats(cleanPrices);
    if (!stats) continue;

    const confidence = computeGroupConfidence(
      stats,
      totalFetched,
      excludedItems.length + outlierCount,
    );
    const pricing = derivePricingTiers(stats);

    const reasoning: string[] = [];
    if (items.length >= 5) {
      reasoning.push(`${items.length} comparable listings found in this configuration`);
    } else {
      reasoning.push(`${items.length} listing${items.length > 1 ? "s" : ""} found — limited sample`);
    }

    if (stats.count !== rawPrices.length) {
      reasoning.push(`${outlierCount} price outlier${outlierCount > 1 ? "s" : ""} removed`);
    }

    const spread = stats.median > 0 ? (stats.p75 - stats.p25) / stats.median : 0;
    if (spread < 0.15) {
      reasoning.push("Tight price clustering — high estimate reliability");
    } else if (spread < 0.3) {
      reasoning.push("Moderate price spread — reasonable estimate");
    } else {
      reasoning.push("Wide price spread — estimates less precise");
    }

    if (tierKey === "base") {
      reasoning.push("Base unit listings only — accessories excluded from pricing");
    }
    if (tierKey === "bundle") {
      reasoning.push("Bundle/kit listings — prices include accessories");
    }

    groups.push({
      groupKey: tierKey,
      label: TIER_LABELS[tierKey] ?? tierKey,
      matchCount: items.length,
      confidenceScore: confidence,
      priceStats: stats,
      derivedPricing: pricing,
      reasoning,
      items,
    });
  }

  // Sort: base first, then base_plus, bundle, full_kit
  const tierOrder = ["base", "base_plus", "bundle", "full_kit"];
  groups.sort(
    (a, b) => tierOrder.indexOf(a.groupKey) - tierOrder.indexOf(b.groupKey),
  );

  return {
    groups,
    excluded: {
      count: excludedItems.length,
      reasons: [...excludeReasons],
    },
  };
}
