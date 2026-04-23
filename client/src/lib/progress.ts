import type { Item } from "../types";

/**
 * Phase 18 — shared completion helpers (mirrors server/progress.service.ts).
 *
 * Kept client-side so progress bars update instantly from the items already in
 * memory — no extra endpoint call needed.
 *
 * Override D2 (Phase 3): completion is determined by completedAt != null.
 * The former DECIDED_STATUSES set has been removed — callers that previously
 * imported it should use isCompletedItem from utils/itemStatus.
 */

export interface Completion {
  total: number;
  completed: number;
  remaining: number;
  percentComplete: number;
}

export function computeCompletion(items: Item[]): Completion {
  const total = items.length;
  const completed = items.filter((it) => it.completedAt != null).length;
  const remaining = total - completed;
  const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, remaining, percentComplete };
}
