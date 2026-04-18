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
         "updatedAt" = $1
       WHERE id = $2`,
      [now, itemId],
    );
    await query('DELETE FROM comparables WHERE "itemId" = $1', [itemId]);

    // 3. Run full pricing pipeline (now eligible).
    const result = await generatePricing(itemId);
    return result;
  });
}
