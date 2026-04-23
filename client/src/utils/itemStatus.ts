import type { Item, ItemIntent, ItemStatus, LifecycleStatus } from "../types";

/** Terminal statuses — user has completed the action. */
export const TERMINAL_STATUSES: ReadonlySet<ItemStatus> = new Set([
  "SOLD", "DONATED", "SHIPPED", "DISCARDED",
]);

/**
 * "Decided" = user has committed a direction. Includes both intents
 * (REVIEWED / LISTED / KEPT) and outcomes (terminal). Only UNREVIEWED
 * items are undecided.
 */
export const DECIDED_STATUSES: ReadonlySet<ItemStatus> = new Set([
  "REVIEWED", "LISTED", "KEPT", "SOLD", "DONATED", "SHIPPED", "DISCARDED",
]);

export function isTerminal(item: Pick<Item, "status">): boolean {
  return TERMINAL_STATUSES.has(item.status);
}

export function isActive(item: Pick<Item, "status">): boolean {
  return !TERMINAL_STATUSES.has(item.status);
}

export function isDecided(item: Pick<Item, "status">): boolean {
  return DECIDED_STATUSES.has(item.status);
}

export function isUndecided(item: Pick<Item, "status">): boolean {
  return !DECIDED_STATUSES.has(item.status);
}

// ── Phase 3: derived intent + lifecycle helpers ──────────────────────────────

/**
 * Statuses that represent a planned-but-not-yet-completed disposition.
 * Used by itemLifecycle() as the fallback after completedAt check.
 */
const PLANNED_STATUSES: ReadonlySet<ItemStatus> = new Set([
  "LISTED", "KEPT", "REVIEWED", "STORED",
]);

/**
 * Lifecycle bucket for an item.
 * Override D2: completedAt != null is the primary completion signal.
 * Falls back to status for the planned/undecided distinction.
 */
export function itemLifecycle(item: Pick<Item, "status" | "completedAt">): LifecycleStatus {
  if (item.completedAt != null) return "completed";
  if (PLANNED_STATUSES.has(item.status)) return "planned";
  return "undecided";
}

/**
 * Derived intent label for an item.
 * Maps status + legacy flags to a canonical ItemIntent.
 * This is the single seam a future backend phase will swap.
 */
export function itemIntent(
  item: Pick<Item, "status" | "recommendation" | "keepFlag" | "willingToSell">,
): ItemIntent {
  switch (item.status) {
    case "SOLD":      return "sold";
    case "DONATED":   return "donated";
    case "SHIPPED":   return "shipped";
    case "DISCARDED": return "discarded";
    case "LISTED":    return "sell";
    case "KEPT":      return "keep";
  }
  if (item.keepFlag) return "keep";
  if (item.status === "REVIEWED") {
    if (item.recommendation === "SHIP")   return "ship";
    if (item.recommendation === "DONATE") return "donate";
    if (item.recommendation === "SELL_NOW" || item.recommendation === "SELL_SOON") return "sell";
    if (item.recommendation === "KEEP") return "keep";
  }
  if (item.willingToSell) return "sell";
  return "undecided";
}

/**
 * Override D2: completion is determined by completedAt != null.
 */
export function isCompletedItem(item: Pick<Item, "completedAt">): boolean {
  return item.completedAt != null;
}

export function isPlannedItem(item: Pick<Item, "status" | "completedAt">): boolean {
  return itemLifecycle(item) === "planned";
}

export function isUndecidedItem(item: Pick<Item, "status" | "completedAt">): boolean {
  return itemLifecycle(item) === "undecided";
}

/**
 * Name fallback chain per Phase 3 contract:
 *   identifiedName → "brand model" → itemName (non-weak) → category (non-weak) → "Needs review".
 * NEVER falls through to itemName when itemName === "Scanned Item" or empty.
 */
export function itemPrimaryLabel(
  item: Pick<Item, "identifiedName" | "identifiedBrand" | "identifiedModel" | "category" | "itemName">,
): { label: string; weak: boolean } {
  const name = item.identifiedName?.trim();
  if (name) return { label: name, weak: false };

  const brand = item.identifiedBrand?.trim();
  const model = item.identifiedModel?.trim();
  const bm = [brand, model].filter(Boolean).join(" ").trim();
  if (bm) return { label: bm, weak: false };

  const legacyName = item.itemName?.trim();
  if (legacyName && legacyName !== "Scanned Item") {
    return { label: legacyName, weak: false };
  }

  const cat = item.category?.trim();
  if (cat && cat !== "Uncategorized") return { label: cat, weak: true };

  return { label: "Needs review", weak: true };
}
