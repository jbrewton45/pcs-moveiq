import type { Item, Comparable, RoomScan } from "../types/domain.js";

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
    identificationQuality: (row.identificationQuality as string | null) ?? undefined,
    pricingEligible: row.pricingEligible == null ? undefined : !!row.pricingEligible,
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
    roomObjectId: (row.roomObjectId as string | null) ?? undefined,
    roomPositionX: (row.roomPositionX as number | null) ?? undefined,
    roomPositionZ: (row.roomPositionZ as number | null) ?? undefined,
    rotationY: (row.rotationY as number | null) ?? undefined,
    listingUrl: (row.listingUrl as string | null) ?? undefined,
    soldPriceUsd: (row.soldPriceUsd as number | null) ?? undefined,
    completedAt: (row.completedAt as string | null) ?? undefined,
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

/** Parse a jsonb column that the pg driver may surface as already-parsed or as a string. */
function parseJsonb<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

export function rowToRoomScan(row: Record<string, unknown>): RoomScan {
  return {
    id: row.id as string,
    roomId: row.roomId as string,
    schemaVersion: Number(row.schemaVersion ?? 1),
    widthM: Number(row.widthM ?? 0),
    lengthM: Number(row.lengthM ?? 0),
    heightM: Number(row.heightM ?? 0),
    areaSqM: Number(row.areaSqM ?? 0),
    areaSqFt: Number(row.areaSqFt ?? 0),
    areaSource: ((row.areaSource as string | null) ?? "bbox") as RoomScan["areaSource"],
    wallCount: Number(row.wallCount ?? 0),
    doorCount: Number(row.doorCount ?? 0),
    windowCount: Number(row.windowCount ?? 0),
    polygonClosed: !!row.polygonClosed,
    hasCurvedWalls: !!row.hasCurvedWalls,
    floorPolygon: parseJsonb<RoomScan["floorPolygon"]>(row.floorPolygon, []),
    walls: parseJsonb<RoomScan["walls"]>(row.walls, []),
    openings: parseJsonb<RoomScan["openings"]>(row.openings, []),
    objects: parseJsonb<RoomScan["objects"]>(row.objects, []),
    usdzPath: (row.usdzPath as string | null) ?? undefined,
    scannedAt: row.scannedAt as string,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}
