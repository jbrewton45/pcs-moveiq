import { query } from "../data/database.js";
import { confirmIdentification } from "./identification.service.js";
import { generatePricing } from "./pricing.service.js";
import { withItemLock } from "../utils/item-lock.js";
import type { Item, Comparable } from "../types/domain.js";

export interface CorrectAndRepriceEdits {
  identifiedName: string;           // required, trimmed non-empty
  identifiedCategory: string;       // required, from fixed 16-value list (validated at controller)
  identifiedBrand?: string | null;  // null if empty
  identifiedModel?: string | null;
}

export async function correctAndReprice(
  itemId: string,
  edits: CorrectAndRepriceEdits,
): Promise<{ item: Item; comparables: Comparable[] } | null> {
  return withItemLock(itemId, async () => {
    // Verify item exists first — avoid doing work for a missing item.
    const existing = await query('SELECT id FROM items WHERE id = $1', [itemId]);
    if (existing.rows.length === 0) return null;

    // 1. Apply user correction; this forces identificationQuality=STRONG, pricingEligible=true.
    //    confirmIdentification's edits parameter is typed as brand/model: string|undefined, but its
    //    DB write uses `edits.identifiedBrand ?? existingValue ?? null`, meaning undefined preserves
    //    the old value. Our edits carry explicit null when the user cleared brand/model, so we cast
    //    to pass nulls through — they propagate correctly at runtime via the fallback chain.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const confirmed = await confirmIdentification(itemId, edits as any);
    if (!confirmed) return null;

    // 2. Null stale pricing + wipe comparables so a mid-pipeline failure does not
    //    leave old prices visible. pricingEligible stays TRUE (set by confirmIdentification).
    const now = new Date().toISOString();
    await query(
      `UPDATE items SET
         "priceFastSale" = NULL,
         "priceFairMarket" = NULL,
         "priceReach" = NULL,
         "pricingConfidence" = NULL,
         "pricingReasoning" = NULL,
         "pricingSuggestedChannel" = NULL,
         "pricingSaleSpeedBand" = NULL,
         "pricingLastUpdatedAt" = NULL,
         "likelyModelOptions" = NULL,
         "requiresModelSelection" = FALSE,
         "updatedAt" = $1
       WHERE id = $2`,
      [now, itemId],
    );

    // Mirror the corrected identification fields to item_decisions. confirmIdentification
    // already forced identificationQuality=STRONG and pricingEligible=true on items.
    await query(
      `INSERT INTO item_decisions (
         "itemId", intent, recommendation, "recommendationReason",
         "pricingEligible",
         "identifiedName", "identifiedCategory", "identifiedBrand", "identifiedModel",
         "likelyModelOptions", "requiresModelSelection",
         "identificationStatus", "identificationQuality",
         "createdAt", "updatedAt"
       )
       VALUES ($1, 'undecided', 'SHIP', NULL, TRUE, $2, $3, $4, $5, NULL, FALSE, $6, 'STRONG', NOW()::text, NOW()::text)
       ON CONFLICT ("itemId") DO UPDATE SET
         intent                    = COALESCE(item_decisions.intent, EXCLUDED.intent),
         recommendation            = COALESCE(item_decisions.recommendation, EXCLUDED.recommendation),
         "recommendationReason"    = COALESCE(item_decisions."recommendationReason", EXCLUDED."recommendationReason"),
         "pricingEligible"         = TRUE,
         "identifiedName"          = EXCLUDED."identifiedName",
         "identifiedCategory"      = EXCLUDED."identifiedCategory",
         "identifiedBrand"         = EXCLUDED."identifiedBrand",
         "identifiedModel"         = EXCLUDED."identifiedModel",
         "likelyModelOptions"      = NULL,
         "requiresModelSelection"  = FALSE,
         "identificationStatus"    = EXCLUDED."identificationStatus",
         "identificationQuality"   = 'STRONG',
         "updatedAt"               = NOW()::text`,
      [
        itemId,
        edits.identifiedName,
        edits.identifiedCategory,
        edits.identifiedBrand ?? null,
        edits.identifiedModel ?? null,
        confirmed.identificationStatus ?? "EDITED",
      ]
    );

    // Null out pricing fields in item_decisions — the subsequent generatePricing call
    // will repopulate them via its own dual-write (Task 5).
    await query(
      `INSERT INTO item_decisions (
         "itemId", intent, recommendation, "recommendationReason",
         "priceFastSale", "priceFairMarket", "priceReach",
         "pricingConfidence", "pricingReasoning",
         "pricingSuggestedChannel", "pricingSaleSpeedBand", "pricingLastUpdatedAt",
         "createdAt", "updatedAt"
       )
       VALUES ($1, 'undecided', 'SHIP', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NOW()::text, NOW()::text)
       ON CONFLICT ("itemId") DO UPDATE SET
         "priceFastSale"           = NULL,
         "priceFairMarket"         = NULL,
         "priceReach"              = NULL,
         "pricingConfidence"       = NULL,
         "pricingReasoning"        = NULL,
         "pricingSuggestedChannel" = NULL,
         "pricingSaleSpeedBand"    = NULL,
         "pricingLastUpdatedAt"    = NULL,
         "updatedAt"               = NOW()::text`,
      [itemId]
    );

    await query('DELETE FROM comparables WHERE "itemId" = $1', [itemId]);

    // 3. Run full pricing pipeline (now eligible).
    const result = await generatePricing(itemId);
    return result;
  });
}
