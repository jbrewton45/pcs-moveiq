import type { Item } from "../types";

interface CompletionStatsProps {
  items: Item[];
}

const COMPLETED_STATUSES = ["SOLD", "DONATED", "SHIPPED", "DISCARDED"] as const;

export function CompletionStats({ items }: CompletionStatsProps) {
  const completed = items.filter((i) =>
    (COMPLETED_STATUSES as readonly string[]).includes(i.status),
  );
  if (completed.length === 0) return null;

  const valueRecovered = items
    .filter((i) => i.status === "SOLD")
    .reduce((sum, i) => sum + (i.soldPriceUsd ?? 0), 0);
  const remaining = items.length - completed.length;

  return (
    <div className="completion-stats" aria-label="Completion progress">
      <span className="completion-stats__chip completion-stats__chip--completed">
        {completed.length} completed
      </span>
      <span className="completion-stats__chip completion-stats__chip--remaining">
        {remaining} remaining
      </span>
      {valueRecovered > 0 && (
        <span className="completion-stats__chip completion-stats__chip--value">
          ${valueRecovered.toLocaleString(undefined, { maximumFractionDigits: 0 })} recovered
        </span>
      )}
    </div>
  );
}
