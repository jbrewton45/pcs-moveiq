import type { Item, ItemStatus } from "../types";

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
