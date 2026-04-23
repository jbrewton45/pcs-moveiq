import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Item, ItemStatus, Project, Room } from "../types";
import { api } from "../api";
import { useActiveProject } from "../context/ActiveProjectContext";
import {
  formatItemDisplay,
  countWeakItems,
  formatItemCountLabel,
} from "../utils/formatItemDisplay";
import { itemLifecycle } from "../utils/itemStatus";

type InventoryMode = "category" | "room" | "status" | "lifecycle";
type InventoryScope = "active" | "all";

const STATUS_ORDER: ItemStatus[] = [
  "UNREVIEWED",
  "REVIEWED",
  "LISTED",
  "KEPT",
  "SHIPPED",
  "DONATED",
  "SOLD",
  "DISCARDED",
];

function statusLabel(status: ItemStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

interface LoadedData {
  items: Item[];
  roomsById: Record<string, Room>;
  projectsById: Record<string, Project>;
}

function groupBy<T, K extends string>(items: T[], keyOf: (it: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = keyOf(it);
    (out[k] ??= []).push(it);
  }
  return out;
}

export function InventoryBrowser() {
  const navigate = useNavigate();
  const { activeProjectId, setActiveProjectId } = useActiveProject();
  const [mode, setMode] = useState<InventoryMode>("category");
  const [scope, setScope] = useState<InventoryScope>("active");
  const [needsIdOnly, setNeedsIdOnly] = useState(false);
  const [roomFilter, setRoomFilter] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [data, setData] = useState<LoadedData>({ items: [], roomsById: {}, projectsById: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const projects = await api.listProjects();
        if (cancelled) return;
        const projectsById = Object.fromEntries(projects.map((p) => [p.id, p]));
        if (!activeProjectId && projects[0]) setActiveProjectId(projects[0].id);
        const effectiveProjects = scope === "all" ? projects : projects.filter((p) => p.id === (activeProjectId ?? projects[0]?.id));
        if (effectiveProjects.length === 0) {
          if (!cancelled) setData({ items: [], roomsById: {}, projectsById });
          return;
        }
        const [allItems, allRooms] = await Promise.all([
          Promise.all(effectiveProjects.map((p) => api.listItems({ projectId: p.id }).catch(() => [] as Item[]))),
          Promise.all(effectiveProjects.map((p) => api.listRooms(p.id).catch(() => [] as Room[]))),
        ]);
        if (cancelled) return;
        const items = allItems.flat();
        const roomsById = Object.fromEntries(allRooms.flat().map((r) => [r.id, r]));
        setData({ items, roomsById, projectsById });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [activeProjectId, scope, setActiveProjectId]);

  const filteredItems = useMemo(() => {
    let out = data.items;
    if (roomFilter) out = out.filter((it) => it.roomId === roomFilter);
    if (needsIdOnly) out = out.filter((it) => formatItemDisplay(it).isWeak);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      out = out.filter((it) => {
        const d = formatItemDisplay(it);
        return d.displayName.toLowerCase().includes(q) || d.displayCategory.toLowerCase().includes(q);
      });
    }
    return out;
  }, [data.items, roomFilter, needsIdOnly, searchTerm]);

  const totalCount = filteredItems.length;
  const weakCount = countWeakItems(filteredItems);

  if (loading) return <p className="loading">Loading inventory...</p>;

  const groups: Array<{ key: string; label: string; items: Item[] }> = (() => {
    if (mode === "category") {
      const grouped = groupBy(filteredItems, (it) => formatItemDisplay(it).displayCategory);
      return Object.keys(grouped)
        .sort()
        .map((key) => ({ key, label: key, items: grouped[key] }));
    }
    if (mode === "room") {
      const grouped = groupBy(filteredItems, (it) => it.roomId ?? "__unassigned");
      return Object.keys(grouped)
        .sort((a, b) => {
          const an = data.roomsById[a]?.roomName ?? "(no room)";
          const bn = data.roomsById[b]?.roomName ?? "(no room)";
          return an.localeCompare(bn);
        })
        .map((roomId) => ({
          key: roomId,
          label: data.roomsById[roomId]?.roomName ?? "(no room)",
          items: grouped[roomId],
        }));
    }
    if (mode === "lifecycle") {
      const LIFECYCLE_ORDER = ["undecided", "planned", "completed"] as const;
      const LIFECYCLE_LABEL: Record<string, string> = {
        undecided: "Undecided",
        planned: "Planned",
        completed: "Completed",
      };
      const grouped = groupBy(filteredItems, (it) => itemLifecycle(it));
      return LIFECYCLE_ORDER
        .filter((lc) => grouped[lc]?.length)
        .map((lc) => ({ key: lc, label: LIFECYCLE_LABEL[lc], items: grouped[lc] }));
    }
    const grouped = groupBy(filteredItems, (it) => it.status);
    return STATUS_ORDER
      .filter((s) => grouped[s]?.length)
      .map((s) => ({ key: s, label: statusLabel(s), items: grouped[s] }));
  })();

  const uniqueRooms = Object.values(data.roomsById);

  return (
    <section className="stacked-view" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Inventory</h2>
        <button
          type="button"
          onClick={() => { setSearchOpen((s) => !s); if (searchOpen) setSearchTerm(""); }}
          aria-label="Search"
          style={{
            background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
            borderRadius: 999, padding: "6px 12px", fontSize: 13, cursor: "pointer",
          }}
        >
          {searchOpen ? "Close" : "🔍 Search"}
        </button>
      </header>

      {searchOpen && (
        <input
          autoFocus
          type="search"
          placeholder="Search items by name or category"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px",
            border: "1px solid var(--border-soft)", borderRadius: "var(--radius-sm)",
            fontSize: 14, background: "var(--bg-elevated)", color: "var(--text-primary)",
          }}
        />
      )}

      <div role="tablist" aria-label="Group by" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
        background: "var(--bg-elevated)", borderRadius: 999, padding: 4, gap: 2,
      }}>
        {(["category", "room", "status", "lifecycle"] as InventoryMode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            style={{
              padding: "6px 10px", fontSize: 13, fontWeight: 600, borderRadius: 999,
              border: "none", cursor: "pointer",
              background: mode === m ? "var(--bg-card)" : "transparent",
              color: mode === m ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            By {m === "category" ? "Category" : m === "room" ? "Room" : m === "status" ? "Status" : "Lifecycle"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          onClick={() => setNeedsIdOnly((v) => !v)}
          style={{
            fontSize: 12, fontWeight: 600,
            background: needsIdOnly ? "var(--accent-bg)" : "var(--bg-elevated)",
            color: needsIdOnly ? "var(--accent-fg)" : "var(--text-secondary)",
            border: "1px solid var(--border-soft)",
            borderRadius: 999, padding: "4px 10px", cursor: "pointer",
          }}
        >
          {needsIdOnly ? "✓ Needs identification" : "Needs identification"}
        </button>
        <button
          type="button"
          onClick={() => setScope((s) => (s === "active" ? "all" : "active"))}
          style={{
            fontSize: 12, fontWeight: 600,
            background: scope === "all" ? "var(--accent-bg)" : "var(--bg-elevated)",
            color: scope === "all" ? "var(--accent-fg)" : "var(--text-secondary)",
            border: "1px solid var(--border-soft)",
            borderRadius: 999, padding: "4px 10px", cursor: "pointer",
          }}
        >
          {scope === "all" ? "All moves" : "Active move"}
        </button>
        {uniqueRooms.length > 0 && (
          <select
            value={roomFilter ?? ""}
            onChange={(e) => setRoomFilter(e.target.value || null)}
            style={{
              fontSize: 12, fontWeight: 600,
              background: "var(--bg-elevated)", color: "var(--text-secondary)",
              border: "1px solid var(--border-soft)",
              borderRadius: 999, padding: "4px 10px", cursor: "pointer",
            }}
          >
            <option value="">All rooms</option>
            {uniqueRooms.map((r) => (
              <option key={r.id} value={r.id}>{r.roomName}</option>
            ))}
          </select>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
        {formatItemCountLabel(totalCount, weakCount)}
      </p>

      {groups.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>
          <p>No items match the current filters.</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <header style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em",
              color: "var(--text-muted)", fontWeight: 700,
            }}>
              <span>{group.label}</span>
              <span>{group.items.length}</span>
            </header>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {group.items.map((item) => {
                const disp = formatItemDisplay(item);
                const room = item.roomId ? data.roomsById[item.roomId] : null;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (room) navigate(`/projects/${room.projectId}/rooms/${room.id}`);
                      }}
                      style={{
                        display: "flex", flexDirection: "column", width: "100%",
                        background: "var(--bg-card)", border: "1px solid var(--border-soft)",
                        borderRadius: "var(--radius-sm)", padding: "10px 12px",
                        textAlign: "left", cursor: "pointer", gap: 2,
                      }}
                    >
                      <span style={{
                        fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
                        fontStyle: disp.isWeakName ? "italic" : "normal",
                        opacity: disp.isWeakName ? 0.75 : 1,
                      }}>
                        {disp.displayName}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        <span style={{
                          fontStyle: disp.isWeakCategory ? "italic" : "normal",
                          opacity: disp.isWeakCategory ? 0.75 : 1,
                        }}>{disp.displayCategory}</span>
                        {room && <> · {room.roomName}</>}
                        {item.priceFairMarket != null && <> · ${Math.round(item.priceFairMarket).toLocaleString()}</>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
