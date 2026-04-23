import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project, Room, Item } from "../types";
import { api } from "../api";
import { useActiveProject } from "../context/ActiveProjectContext";
import { hasUnsyncedScan, getScanData } from "../plugins/scanStore";
import { countWeakItems } from "../utils/formatItemDisplay";

const ROOM_EMOJIS: Record<string, string> = {
  "Living Room": "🛋️",
  "Bedroom": "🛏️",
  "Kitchen": "🍳",
  "Bathroom": "🚿",
  "Garage": "🔧",
  "Office": "💻",
  "Storage": "📦",
  "Dining Room": "🍽️",
  "Laundry": "🧺",
  "Other": "📋",
};

function roomEmoji(type: string): string {
  return ROOM_EMOJIS[type] ?? "🏠";
}

interface RoomCoverage {
  room: Room;
  itemCount: number;
  weakCount: number;
  hasScan: boolean;
  hasUnsynced: boolean;
  coveragePct: number;
  statusLabel: string;
}

function computeCoverage(room: Room, items: Item[], hasScan: boolean, hasUnsynced: boolean): RoomCoverage {
  const itemCount = items.length;
  const weakCount = countWeakItems(items);
  const scanScore = hasScan ? 50 : 0;
  const itemScore = itemCount === 0 ? 0 : itemCount >= 5 ? 50 : Math.round((itemCount / 5) * 50);
  const coveragePct = Math.min(100, scanScore + itemScore);
  let statusLabel: string;
  if (!hasScan && itemCount === 0) statusLabel = "Not started";
  else if (!hasScan) statusLabel = `${itemCount} items, no scan`;
  else if (itemCount === 0) statusLabel = "Scanned, no items";
  else if (hasUnsynced) statusLabel = `${itemCount} items · unsynced scan`;
  else statusLabel = `${itemCount} items · scanned`;
  return { room, itemCount, weakCount, hasScan, hasUnsynced, coveragePct, statusLabel };
}

interface RoomTileProps {
  coverage: RoomCoverage;
  onTap: () => void;
}

function RoomTile({ coverage, onTap }: RoomTileProps) {
  const { room, weakCount, coveragePct, statusLabel, hasUnsynced } = coverage;
  const borderColor = coveragePct === 0
    ? "var(--border-soft)"
    : coveragePct >= 100
      ? "var(--accent-border)"
      : "var(--border-soft)";
  const barColor = coveragePct >= 100
    ? "#22c55e"
    : coveragePct >= 50
      ? "#f59e0b"
      : "var(--accent-light)";
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <div style={{
          width: 42, height: 42,
          background: "var(--bg-elevated)",
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
        }}>
          {roomEmoji(room.roomType)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            {room.roomName}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            {statusLabel}
          </p>
        </div>
        {hasUnsynced && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: "rgba(245,158,11,0.12)", color: "#b45309",
            borderRadius: 999, padding: "3px 8px",
          }}>unsynced</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          height: 6, background: "var(--bg-elevated)", borderRadius: 999, overflow: "hidden",
        }}>
          <div style={{
            width: `${coveragePct}%`, height: "100%",
            background: barColor,
            transition: "width 200ms ease",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
          <span>{coveragePct}% coverage</span>
          {weakCount > 0 && <span>{weakCount} unidentified</span>}
        </div>
      </div>
    </button>
  );
}

export function RoomsView() {
  const navigate = useNavigate();
  const { activeProjectId, setActiveProjectId } = useActiveProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [coverages, setCoverages] = useState<RoomCoverage[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId],
  );

  useEffect(() => {
    let cancelled = false;
    api.listProjects()
      .then((projs) => {
        if (cancelled) return;
        setProjects(projs);
        if (!activeProjectId && projs[0]) setActiveProjectId(projs[0].id);
      })
      .catch(() => { if (!cancelled) setProjects([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeProjectId, setActiveProjectId]);

  useEffect(() => {
    if (!selectedProject) { setCoverages([]); return; }
    let cancelled = false;
    async function loadCoverage() {
      try {
        const rooms = await api.listRooms(selectedProject!.id);
        const perRoom = await Promise.all(rooms.map(async (room) => {
          const [items, serverScan] = await Promise.all([
            api.listItems({ roomId: room.id }).catch(() => [] as Item[]),
            api.getRoomScan(room.id).catch(() => null),
          ]);
          const localScan = getScanData(room.id);
          const hasScan = Boolean(serverScan) || Boolean(localScan);
          const hasUnsynced = hasUnsyncedScan(room.id);
          return computeCoverage(room, items, hasScan, hasUnsynced);
        }));
        if (!cancelled) setCoverages(perRoom);
      } catch {
        if (!cancelled) setCoverages([]);
      }
    }
    void loadCoverage();
    return () => { cancelled = true; };
  }, [selectedProject]);

  if (loading) return <p className="loading">Loading rooms...</p>;
  if (projects.length === 0) {
    return (
      <section className="stacked-view" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
        <h2 style={{ margin: "0 0 8px" }}>No moves yet</h2>
        <p style={{ color: "var(--text-secondary)" }}>Create a move from the Home tab to start scanning rooms.</p>
      </section>
    );
  }
  if (!selectedProject) return null;

  const totalRooms = coverages.length;
  const fullyCovered = coverages.filter((c) => c.coveragePct >= 100).length;
  const scannedRooms = coverages.filter((c) => c.hasScan).length;

  return (
    <section className="stacked-view" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{selectedProject.projectName}</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            {totalRooms === 0
              ? "No rooms yet"
              : `${fullyCovered}/${totalRooms} rooms fully covered · ${scannedRooms} scanned`}
          </p>
        </div>
        {totalRooms > 0 && (
          <button
            type="button"
            onClick={() => navigate(`/projects/${selectedProject.id}`)}
            style={{
              background: "var(--accent-bg)", color: "var(--accent-fg)",
              border: "1px solid var(--accent-border)",
              borderRadius: 999, padding: "6px 14px",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            + Add room
          </button>
        )}
      </header>

      {totalRooms === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-md)" }}>
          <p style={{ margin: "0 0 12px", color: "var(--text-secondary)" }}>No rooms in this move yet.</p>
          <button
            type="button"
            className="homer-btn-primary"
            onClick={() => navigate(`/projects/${selectedProject.id}`)}
          >
            + Add first room
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {coverages.map((c) => (
            <RoomTile
              key={c.room.id}
              coverage={c}
              onTap={() => navigate(`/projects/${selectedProject.id}/rooms/${c.room.id}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
