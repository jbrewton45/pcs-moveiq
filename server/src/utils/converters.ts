import type { Item, Comparable } from "../types/domain.js";

export function rowToItem(row: Record<string, unknown>): Item {
  return {
    ...row,
    sentimentalFlag: !!(row.sentimentalFlag as number),
    keepFlag: !!(row.keepFlag as number),
    willingToSell: !!(row.willingToSell as number),
    notes: (row.notes as string | null) ?? undefined,
    weightLbs: (row.weightLbs as number | null) ?? undefined,
    photoPath: (row.photoPath as string | null) ?? undefined,
    identifiedName: (row.identifiedName as string | null) ?? undefined,
    identifiedCategory: (row.identifiedCategory as string | null) ?? undefined,
    identifiedBrand: (row.identifiedBrand as string | null) ?? undefined,
    identifiedModel: (row.identifiedModel as string | null) ?? undefined,
    identificationConfidence: (row.identificationConfidence as number | null) ?? undefined,
    identificationReasoning: (row.identificationReasoning as string | null) ?? undefined,
    identificationStatus: ((row.identificationStatus as string | null) ?? "NONE") as Item["identificationStatus"],
    priceFastSale: (row.priceFastSale as number | null) ?? undefined,
    priceFairMarket: (row.priceFairMarket as number | null) ?? undefined,
    priceReach: (row.priceReach as number | null) ?? undefined,
    pricingConfidence: (row.pricingConfidence as number | null) ?? undefined,
    pricingReasoning: (row.pricingReasoning as string | null) ?? undefined,
    pricingSuggestedChannel: (row.pricingSuggestedChannel as string | null) ?? undefined,
    pricingSaleSpeedBand: (row.pricingSaleSpeedBand as string | null) ?? undefined,
    pricingLastUpdatedAt: (row.pricingLastUpdatedAt as string | null) ?? undefined,
    recommendationReason: (row.recommendationReason as string | null) ?? undefined,
    pendingClarifications: (row.pendingClarifications as string | null) ?? undefined,
    clarificationAnswers: (row.clarificationAnswers as string | null) ?? undefined,
  } as Item;
}

export function rowToComparable(row: Record<string, unknown>): Comparable {
  return {
    ...row,
    url: (row.url as string | null) ?? undefined,
    thumbnailUrl: (row.thumbnailUrl as string | null) ?? undefined,
    soldStatus: (row.soldStatus as string | null) ?? undefined,
  } as Comparable;
}
