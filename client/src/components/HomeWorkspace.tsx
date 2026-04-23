import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Item, PrioritizedItem, Project, Room } from "../types";
import { api } from "../api";
import { useActiveProject } from "../context/ActiveProjectContext";
import { ProjectSwitcherSheet } from "./ProjectSwitcherSheet";
import { ProjectForm } from "./ProjectForm";
import { formatItemDisplay, countWeakItems } from "../utils/formatItemDisplay";
import { isActive } from "../utils/itemStatus";

const PRIORITY_PREVIEW_COUNT = 5;

function daysUntil(dateIso: string | undefined): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso).getTime();
  if (Number.isNaN(target)) return null;
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function HomeWorkspace() {
  const navigate = useNavigate();
  const { activeProjectId, setActiveProjectId } = useActiveProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectRefresh, setProjectRefresh] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [priorities, setPriorities] = useState<PrioritizedItem[]>([]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId],
  );

  useEffect(() => {
    let cancelled = false;
    api.listProjects()
      .then((ps) => {
        if (cancelled) return;
        setProjects(ps);
        if (!activeProjectId && ps[0]) setActiveProjectId(ps[0].id);
        if (ps.length > 1 && !activeProjectId) setSwitcherOpen(true);
      })
      .catch(() => { if (!cancelled) setProjects([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectRefresh, activeProjectId, setActiveProjectId]);

  useEffect(() => {
    if (!activeProject) { setRooms([]); setItems([]); setPriorities([]); return; }
    let cancelled = false;
    Promise.all([
      api.listRooms(activeProject.id).catch(() => [] as Room[]),
      api.listItems({ projectId: activeProject.id }).catch(() => [] as Item[]),
      api.getPrioritizedItems(activeProject.id, PRIORITY_PREVIEW_COUNT).catch(() => [] as PrioritizedItem[]),
    ]).then(([rs, its, prio]) => {
      if (cancelled) return;
      setRooms(rs);
      setItems(its);
      setPriorities(prio);
    });
    return () => { cancelled = true; };
  }, [activeProject]);

  if (loading) return <p className="loading">Loading...</p>;

  if (projects.length === 0) {
    return (
      <section className="stacked-view" style={{ padding: 16 }}>
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
          <h2 style={{ margin: "0 0 8px" }}>Start your first move</h2>
          <p style={{ color: "var(--text-secondary)", margin: "0 0 16px" }}>
            Create a project to begin cataloging rooms and items.
          </p>
        </div>
        <ProjectForm onCreated={() => setProjectRefresh((k) => k + 1)} />
      </section>
    );
  }

  if (!activeProject) {
    return (
      <section className="stacked-view" style={{ padding: 16 }}>
        <p>Select a move to continue.</p>
        <button
          type="button"
          className="homer-btn-primary"
          onClick={() => setSwitcherOpen(true)}
        >
          Choose a move
        </button>
        <ProjectSwitcherSheet
          open={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          refreshKey={projectRefresh}
        />
      </section>
    );
  }

  const daysLeft = daysUntil(activeProject.hardMoveDate);
  const totalRooms = rooms.length;
  const weakCount = countWeakItems(items);
  const priorityItems = priorities
    .map((p) => ({ priority: p, item: items.find((i) => i.id === p.itemId) }))
    .filter((x): x is { priority: PrioritizedItem; item: Item } => !!x.item)
    .slice(0, PRIORITY_PREVIEW_COUNT);

  const countdownTone =
    daysLeft == null ? "neutral" : daysLeft <= 14 ? "danger" : daysLeft <= 45 ? "warn" : "ok";
  const countdownColor =
    countdownTone === "danger" ? "#ef4444"
    : countdownTone === "warn" ? "#f59e0b"
    : countdownTone === "ok" ? "#22c55e"
    : "var(--text-secondary)";

  return (
    <section className="stacked-view" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--bg-elevated)", border: "1px solid var(--border-soft)",
            borderRadius: 999, padding: "6px 12px", cursor: "pointer",
            fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
          }}
        >
          <span>📍 {activeProject.projectName}</span>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>▾</span>
        </button>
        <button
          type="button"
          onClick={() => setShowCreateProject((v) => !v)}
          style={{
            background: "transparent", border: "none", color: "var(--accent-fg)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {showCreateProject ? "Cancel" : "+ New move"}
        </button>
      </header>

      {showCreateProject && (
        <div style={{ padding: 4 }}>
          <ProjectForm onCreated={() => { setProjectRefresh((k) => k + 1); setShowCreateProject(false); }} />
        </div>
      )}

      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-md)", padding: 16,
      }}>
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Move countdown
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 800, color: countdownColor }}>
          {daysLeft == null
            ? "No move date set"
            : daysLeft < 0
              ? `${Math.abs(daysLeft)} days past`
              : daysLeft === 0
                ? "Today"
                : `${daysLeft} days`}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
          {activeProject.destination ? `to ${activeProject.destination}` : activeProject.moveType}
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate("/rooms")}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--bg-card)", border: "1px solid var(--border-soft)",
          borderRadius: "var(--radius-md)", padding: 16, cursor: "pointer",
          textAlign: "left", width: "100%",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Room coverage
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>
            {totalRooms} room{totalRooms === 1 ? "" : "s"}
          </p>
        </div>
        <span style={{ fontSize: 13, color: "var(--accent-fg)" }}>See rooms →</span>
      </button>

      {weakCount > 0 && (
        <button
          type="button"
          onClick={() => navigate("/inventory?needsId=1")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: "var(--radius-md)", padding: 12, cursor: "pointer",
            textAlign: "left", width: "100%", color: "#b45309", fontWeight: 600, fontSize: 14,
          }}
        >
          <span>⚠️ {weakCount} item{weakCount === 1 ? "" : "s"} need identification</span>
          <span style={{ fontSize: 12 }}>Review →</span>
        </button>
      )}

      <section>
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--text-muted)", fontWeight: 700, margin: "0 0 8px",
        }}>
          <span>Ready to pack</span>
          <button
            type="button"
            onClick={() => navigate(`/projects/${activeProject.id}`)}
            style={{ background: "transparent", border: "none", color: "var(--accent-fg)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Full packing list →
          </button>
        </header>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 8, marginBottom: 16,
        }}>
          {(["KEEP", "SHIP", "SELL_NOW", "DONATE"] as const).map((rec) => {
            const bucket = items.filter((i) => isActive(i) && i.recommendation === rec);
            const label = rec === "SELL_NOW" ? "Sell" : rec.charAt(0) + rec.slice(1).toLowerCase();
            return (
              <div
                key={rec}
                style={{
                  background: "var(--bg-card)", border: "1px solid var(--border-soft)",
                  borderRadius: "var(--radius-sm)", padding: 10,
                }}
              >
                <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {label}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700 }}>
                  {bucket.length}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--text-muted)", fontWeight: 700, margin: "0 0 8px",
        }}>
          <span>Top priorities</span>
          <button
            type="button"
            onClick={() => navigate("/sell")}
            style={{ background: "transparent", border: "none", color: "var(--accent-fg)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            See all →
          </button>
        </header>
        {priorityItems.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>
            No prioritized items yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {priorityItems.map(({ priority, item }) => {
              const disp = formatItemDisplay(item);
              const room = rooms.find((r) => r.id === item.roomId);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (room) navigate(`/projects/${activeProject.id}/rooms/${room.id}`);
                    }}
                    style={{
                      display: "flex", flexDirection: "column", width: "100%",
                      background: "var(--bg-card)", border: "1px solid var(--border-soft)",
                      borderRadius: "var(--radius-sm)", padding: "10px 12px",
                      textAlign: "left", cursor: "pointer", gap: 2,
                    }}
                  >
                    <span style={{
                      fontSize: 14, fontWeight: 600,
                      fontStyle: disp.isWeakName ? "italic" : "normal",
                      opacity: disp.isWeakName ? 0.75 : 1,
                    }}>
                      {disp.displayName}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {item.identificationQuality === "WEAK"
                        ? `Needs identification · score ${Math.round(priority.score)}`
                        : `${priority.recommendation} · score ${Math.round(priority.score)}`}
                      {room && <> · {room.roomName}</>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ProjectSwitcherSheet
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        refreshKey={projectRefresh}
        onSwitched={(id) => setActiveProjectId(id)}
      />
    </section>
  );
}
