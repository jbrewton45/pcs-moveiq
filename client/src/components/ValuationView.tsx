import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project, Item } from "../types";
import { api } from "../api";



function categoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    furniture: "🛋️", electronics: "💻", appliances: "🏠", clothing: "👕",
    tools: "🔧", kitchen: "🍳", sports: "⚽", books: "📚", toys: "🧸",
    art: "🎨", jewelry: "💎", vehicle: "🚗", musical: "🎸",
  };
  const key = cat.toLowerCase();
  return Object.entries(map).find(([k]) => key.includes(k))?.[1] || "📦";
}

interface FeatureCardProps {
  icon: string;
  title: string;
  desc: string;
  color?: string;
}

function FeatureCard({ icon, title, desc, color = "var(--accent-bg)" }: FeatureCardProps) {
  return (
    <div className="homer-feature-card">
      <div className="homer-feature-card__icon" style={{ background: color }}>
        {icon}
      </div>
      <p className="homer-feature-card__title">{title}</p>
      <p className="homer-feature-card__desc">{desc}</p>
    </div>
  );
}

export function ValuationView() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const projs = await api.listProjects();
        if (cancelled) return;
        setProjects(projs);

        // Load items from all projects
        const allItems: Item[] = [];
        for (const proj of projs) {
          try {
            const rooms = await api.listRooms(proj.id);
            for (const room of rooms) {
              try {
                const roomItems = await api.listItems({ projectId: proj.id, roomId: room.id });
                allItems.push(...roomItems);
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
        if (!cancelled) setItems(allItems);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return (
    <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)" }}>
      Loading valuation data...
    </div>
  );

  // Calculate total estimated value from item pricing
  const itemsWithPrice = items.filter((i) => i.priceFairMarket && i.priceFairMarket > 0);
  const totalFairMarket = itemsWithPrice.reduce((sum, i) => sum + (i.priceFairMarket || 0), 0);
  const totalFastSale = items.reduce((sum, i) => sum + (i.priceFastSale || 0), 0);
  const totalReach = items.reduce((sum, i) => sum + (i.priceReach || 0), 0);

  // Group by category for breakdown
  const byCategory = items.reduce<Record<string, { count: number; value: number; emoji: string }>>((acc, item) => {
    const cat = item.identifiedCategory || item.category || "Other";
    if (!acc[cat]) acc[cat] = { count: 0, value: 0, emoji: categoryEmoji(cat) };
    acc[cat].count++;
    acc[cat].value += item.priceFairMarket || 0;
    return acc;
  }, {});

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 8);

  // Top valued items
  const topItems = [...items]
    .filter(i => i.priceFairMarket && i.priceFairMarket > 0)
    .sort((a, b) => (b.priceFairMarket || 0) - (a.priceFairMarket || 0))
    .slice(0, 6);

  const hasData = itemsWithPrice.length > 0;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Hero Value Card */}
      <div className="homer-value-hero">
        <p className="homer-value-hero__label">Total Value in USD</p>
        <p className="homer-value-hero__amount">
          <span className="homer-value-hero__currency">$</span>
          {hasData ? totalFairMarket.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
        </p>
        <p className="homer-value-hero__sub">
          {hasData
            ? `Across ${itemsWithPrice.length} valued items in ${projects.length} project${projects.length !== 1 ? "s" : ""}`
            : `${items.length} items tracked — add pricing to see value`}
        </p>
      </div>

      {/* Pricing range */}
      {hasData && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: "var(--space-3)",
        }}>
          {[
            { label: "Fast Sale", value: totalFastSale, color: "#f59e0b" },
            { label: "Fair Market", value: totalFairMarket, color: "#3b82f6" },
            { label: "Max Reach", value: totalReach, color: "#22c55e" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "var(--bg-card)", border: "1px solid var(--border-soft)",
              borderRadius: "var(--radius-md)", padding: "var(--space-3)", textAlign: "center",
            }}>
              <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</p>
              <p style={{ fontSize: "16px", fontWeight: 700, color }}>${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
            </div>
          ))}
        </div>
      )}

      {/* Feature Cards — like Homer's "Always Know Your Home's Worth" */}
      <div>
        <p className="homer-section-label">Insights</p>
        <div className="homer-feature-grid">
          <FeatureCard
            icon="📈"
            title="Market Value"
            desc="Up-to-date fair market estimates for your items"
          />
          <FeatureCard
            icon="🔄"
            title="Auto Updates"
            desc="Values refresh as you add and price items"
            color="rgba(34,197,94,0.12)"
          />
          <FeatureCard
            icon="📊"
            title="Track Value"
            desc="See how your total inventory value changes"
            color="rgba(245,158,11,0.12)"
          />
          <FeatureCard
            icon="🏷️"
            title="By Category"
            desc="Understand value breakdown across categories"
            color="rgba(168,85,247,0.12)"
          />
        </div>
      </div>

      {/* Category Breakdown */}
      {topCategories.length > 0 && (
        <div>
          <p className="homer-section-label">By Category</p>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {topCategories.map(([cat, data]) => (
              <div key={cat} className="homer-value-row" style={{ padding: "12px 16px" }}>
                <div className="homer-value-row__left">
                  <div className="homer-value-row__icon">{data.emoji}</div>
                  <div>
                    <p className="homer-value-row__name">{cat}</p>
                    <p className="homer-value-row__sub">{data.count} item{data.count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <span className="homer-value-row__amount">
                  {data.value > 0 ? `$${data.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Valued Items */}
      {topItems.length > 0 && (
        <div>
          <p className="homer-section-label">Top Items by Value</p>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {topItems.map((item) => (
              <div key={item.id} className="homer-value-row" style={{ padding: "12px 16px" }}>
                <div className="homer-value-row__left">
                  <div className="homer-value-row__icon">{categoryEmoji(item.identifiedCategory || item.category || "")}</div>
                  <div>
                    <p className="homer-value-row__name">{item.identifiedName || item.itemName}</p>
                    <p className="homer-value-row__sub">{item.identifiedBrand || item.category}</p>
                  </div>
                </div>
                <span className="homer-value-row__amount">${(item.priceFairMarket || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {!hasData && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "var(--space-6)" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>💰</div>
          <p style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "16px", marginBottom: "6px" }}>
            No items tracked yet
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "16px" }}>
            Add items to your inventory to see total value estimates.
          </p>
          <button className="homer-btn-primary" onClick={() => navigate("/")}>
            Go to Inventory
          </button>
        </div>
      )}

      {!hasData && items.length > 0 && (
        <div style={{
          background: "rgba(59,130,246,0.08)", border: "1px solid var(--accent-border)",
          borderRadius: "var(--radius-md)", padding: "var(--space-4)", textAlign: "center",
        }}>
          <p style={{ color: "var(--accent-light)", fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}>
            💡 Add pricing to see your total value
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
            {items.length} items tracked. Open any item in Inventory and tap "Analyze" to get a price estimate.
          </p>
        </div>
      )}

    </div>
  );
}
