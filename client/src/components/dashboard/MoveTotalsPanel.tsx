import { useEffect, useMemo, useState } from "react";
import type { Item, Project } from "../../types";
import { api } from "../../api";
import { useActiveProject } from "../../context/ActiveProjectContext";
import { formatItemDisplay } from "../../utils/formatItemDisplay";

type Scope = "active" | "all";

interface CategoryBucket {
  category: string;
  count: number;
  value: number;
}

const CATEGORY_EMOJI: Record<string, string> = {
  furniture: "🛋️", electronics: "💻", appliances: "🏠", clothing: "👕",
  tools: "🔧", kitchen: "🍳", sports: "⚽", books: "📚", toys: "🧸",
  art: "🎨", jewelry: "💎", vehicle: "🚗", musical: "🎸",
};

function categoryEmoji(cat: string): string {
  const key = cat.toLowerCase();
  return CATEGORY_EMOJI[key] ?? "📦";
}

export function MoveTotalsPanel() {
  const { activeProjectId } = useActiveProject();
  const [scope, setScope] = useState<Scope>("active");
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const allProjects = await api.listProjects();
        if (cancelled) return;
        setProjects(allProjects);
        const targets = scope === "all"
          ? allProjects
          : allProjects.filter((p) => p.id === (activeProjectId ?? allProjects[0]?.id));
        if (targets.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }
        const lists = await Promise.all(
          targets.map((p) => api.listItems({ projectId: p.id }).catch(() => [] as Item[])),
        );
        if (!cancelled) setItems(lists.flat());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [scope, activeProjectId]);

  const stats = useMemo(() => {
    const valued = items.filter((i) => i.priceFairMarket && i.priceFairMarket > 0);
    const total = valued.reduce((s, i) => s + (i.priceFairMarket || 0), 0);
    const buckets: Record<string, CategoryBucket> = {};
    for (const item of items) {
      const disp = formatItemDisplay(item);
      const cat = disp.displayCategory;
      if (!buckets[cat]) buckets[cat] = { category: cat, count: 0, value: 0 };
      buckets[cat].count += 1;
      buckets[cat].value += item.priceFairMarket || 0;
    }
    const top = Object.values(buckets)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return { total, valuedCount: valued.length, totalCount: items.length, buckets: top };
  }, [items]);

  if (loading) return null;
  if (projects.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Move totals
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>
            ${stats.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            {stats.valuedCount} of {stats.totalCount} items valued
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--bg-elevated)", borderRadius: 999, padding: 3 }}>
          {(["active", "all"] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              style={{
                fontSize: 12, fontWeight: 600,
                background: scope === s ? "var(--bg-card)" : "transparent",
                color: scope === s ? "var(--text-primary)" : "var(--text-secondary)",
                border: "none", borderRadius: 999, padding: "4px 10px", cursor: "pointer",
              }}
            >
              {s === "active" ? "Active" : "All moves"}
            </button>
          ))}
        </div>
      </header>

      {stats.buckets.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {stats.buckets.map((b) => (
            <span
              key={b.category}
              style={{
                fontSize: 12, fontWeight: 600,
                background: "var(--bg-elevated)", color: "var(--text-secondary)",
                borderRadius: 999, padding: "4px 10px",
              }}
            >
              {categoryEmoji(b.category)} {b.category} · {b.count} · ${Math.round(b.value).toLocaleString()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
