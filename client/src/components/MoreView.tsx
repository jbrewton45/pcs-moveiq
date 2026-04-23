import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project, Item } from "../types";
import { api } from "../api";
import { useActiveProject } from "../context/ActiveProjectContext";
import { formatItemDisplay } from "../utils/formatItemDisplay";

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function MoreView() {
  const navigate = useNavigate();
  const { activeProjectId, setActiveProjectId } = useActiveProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listProjects()
      .then((ps) => { if (!cancelled) setProjects(ps); })
      .catch(() => { if (!cancelled) setProjects([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleExportActive() {
    if (!activeProjectId) return;
    setExporting(true);
    try {
      const [project, rooms, items] = await Promise.all([
        api.getProject(activeProjectId),
        api.listRooms(activeProjectId),
        api.listItems({ projectId: activeProjectId }),
      ]);
      const exported = {
        exportedAt: new Date().toISOString(),
        project,
        rooms,
        items: items.map((it: Item) => ({ ...it, display: formatItemDisplay(it) })),
      };
      downloadJson(exported, `moveiq-${project.projectName.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="stacked-view" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>More</h2>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          Switch moves, tune settings, and export data.
        </p>
      </div>

      <section>
        <header style={{
          fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--text-muted)", fontWeight: 700, margin: "0 0 8px",
        }}>
          Your moves
        </header>
        {loading ? (
          <p className="loading">Loading...</p>
        ) : projects.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>No moves yet. Create one from the Home tab.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {projects.map((p) => {
              const isActive = p.id === activeProjectId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveProjectId(p.id);
                      navigate("/");
                    }}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      width: "100%", textAlign: "left",
                      background: "var(--bg-card)",
                      border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border-soft)"}`,
                      borderRadius: "var(--radius-sm)", padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{p.projectName}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                        {p.currentLocation} → {p.destination}
                      </p>
                    </div>
                    {isActive && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        background: "var(--accent-bg)", color: "var(--accent-fg)",
                        borderRadius: 999, padding: "3px 8px",
                      }}>Active</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <header style={{
          fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--text-muted)", fontWeight: 700, margin: "0 0 8px",
        }}>
          Settings
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <MoreLink label="Marketplace settings" onClick={() => navigate("/settings")} />
          <MoreLink label="Profile" onClick={() => navigate("/profile")} />
          <MoreLink label="Pricing analysis" onClick={() => navigate("/pricing")} />
          {activeProjectId && (
            <MoreLink label="Move settings (calibration)" onClick={() => navigate(`/projects/${activeProjectId}`)} />
          )}
        </div>
      </section>

      <section>
        <header style={{
          fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--text-muted)", fontWeight: 700, margin: "0 0 8px",
        }}>
          Export
        </header>
        <button
          type="button"
          disabled={!activeProjectId || exporting}
          onClick={() => { void handleExportActive(); }}
          style={{
            background: activeProjectId ? "var(--accent-bg)" : "var(--bg-elevated)",
            color: activeProjectId ? "var(--accent-fg)" : "var(--text-muted)",
            border: "1px solid var(--border-soft)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 16px",
            fontSize: 14, fontWeight: 600,
            cursor: activeProjectId ? "pointer" : "not-allowed",
            width: "100%",
          }}
        >
          {exporting ? "Exporting..." : activeProjectId ? "Export active move as JSON" : "Select a move to export"}
        </button>
      </section>
    </section>
  );
}

function MoreLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        width: "100%", textAlign: "left",
        background: "var(--bg-card)", border: "1px solid var(--border-soft)",
        borderRadius: "var(--radius-sm)", padding: "12px 14px",
        fontSize: 14, fontWeight: 500, color: "var(--text-primary)", cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>›</span>
    </button>
  );
}
