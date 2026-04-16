import type { Item } from "../types";

/**
 * Phase 18 — shared completion helpers (mirrors server/progress.service.ts).
 *
 * Kept client-side so progress bars update instantly from the items already in
 * memory — no extra endpoint call needed.
 */

export const DECIDED_STATUSES = new Set([
  "SOLD", "DONATED", "SHIPPED", "DISCARDED", "KEPT", "STORED",
]);

export interface Completion {
  total: number;
  completed: number;
  remaining: number;
  percentComplete: number;
}

export function computeCompletion(items: Item[]): Completion {
  const total = items.length;
  const completed = items.filter((it) => DECIDED_STATUSES.has(it.status)).length;
  const remaining = total - completed;
  const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, remaining, percentComplete };
}
