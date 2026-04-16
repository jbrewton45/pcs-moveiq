import type { Item } from "../types/domain.js";
import { listItemsByProject } from "./items.service.js";
import { listItemsByRoom } from "./items.service.js";

/**
 * Phase 18 — Completion tracking helpers.
 *
 * An item is "decided" when it has reached a terminal disposition status.
 * LISTED is NOT terminal — the user has started selling but hasn't finished.
 * REVIEWED is also in-progress (decision made, not yet acted on).
 */
export const DECIDED_STATUSES = new Set<string>([
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

export async function getRoomCompletion(roomId: string): Promise<Completion> {
  return computeCompletion(await listItemsByRoom(roomId));
}

export async function getProjectCompletion(projectId: string): Promise<Completion> {
  return computeCompletion(await listItemsByProject(projectId));
}
