import { useEffect, useState } from "react";
import type { Project } from "../types";
import { api } from "../api";

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysUntil(iso: string): number {
  const msPerDay = 86_400_000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

function CountdownChip({ days }: { days: number }) {
  const isPast = days < 0;
  const variant = isPast ? "past" : days <= 30 ? "red" : days <= 90 ? "yellow" : "green";
  const colors: Record<string, { bg: string; color: string }> = {
    green:  { bg: "rgba(34,197,94,0.12)",   color: "#22c55e" },
    yellow: { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b" },
    red:    { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
    past:   { bg: "rgba(139,146,168,0.12)", color: "#8b92a8" },
  };
  const c = colors[variant];
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "999px",
      fontSize: "11px",
      fontWeight: 700,
      background: c.bg,
      color: c.color,
    }}>
      {isPast ? `${Math.abs(days)}d past` : `${days}d to PCS`}
    </span>
  );
}

function ProjectCard({ project, onSelect }: { project: Project; onSelect: () => void }) {
  const days = project.hardMoveDate ? daysUntil(project.hardMoveDate) : null;

  return (
    <div className="homer-project-card" onClick={onSelect} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}>
      {/* Header */}
      <div className="homer-project-card__header">
        <div className="homer-project-card__icon">🏠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="homer-project-card__name">{project.projectName}</h3>
          <p className="homer-project-card__route">
            {project.currentLocation} → {project.destination}
          </p>
        </div>
        {days !== null && <CountdownChip days={days} />}
      </div>

      {/* Stats row */}
      <div className="homer-project-card__stats">
        <div className="homer-project-card__stat">
          <span className="homer-project-card__stat-label">Move Type</span>
          <span className="homer-project-card__stat-value">{label(project.moveType)}</span>
        </div>
        <div className="homer-project-card__stat">
          <span className="homer-project-card__stat-label">Goal</span>
          <span className="homer-project-card__stat-value">{label(project.userGoal)}</span>
        </div>
        <div className="homer-project-card__stat">
          <span className="homer-project-card__stat-label">Housing</span>
          <span className="homer-project-card__stat-value">{label(project.housingAssumption)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="homer-project-card__footer">
        <span className="homer-project-card__date">PCS: {formatDate(project.hardMoveDate)}</span>
        <span className="homer-project-card__cta">View Inventory →</span>
      </div>
    </div>
  );
}

interface Props {
  refreshKey: number;
  onSelect: (projectId: string) => void;
}

export function ProjectList({ refreshKey, onSelect }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .listProjects()
      .then(data => { if (!cancelled) setProjects(data); })
      .catch(() => { if (!cancelled) setProjects([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading) return (
    <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)" }}>
      Loading your projects...
    </div>
  );

  if (projects.length === 0) return (
    <div style={{ padding: "32px 16px", textAlign: "center" }}>
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>📦</div>
      <p style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "17px", marginBottom: "6px" }}>
        No projects yet
      </p>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
        Create a project below to start tracking your inventory.
      </p>
    </div>
  );

  return (
    <div className="homer-project-list">
      <p className="homer-section-label" style={{ padding: "16px 16px 0" }}>
        Your Moves ({projects.length})
      </p>
      <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onSelect={() => onSelect(p.id)} />
        ))}
      </div>
    </div>
  );
}
