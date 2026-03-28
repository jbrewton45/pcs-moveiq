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

  if (loading) return <p className="loading">Loading projects...</p>;
  if (projects.length === 0) return <p className="empty">No projects yet. Create one above.</p>;

  return (
    <section className="project-list">
      <h2>Your Move Projects</h2>
      <div className="project-grid">
        {projects.map((p) => (
          <div
            key={p.id}
            className="project-card project-card--interactive"
            onClick={() => onSelect(p.id)}
          >
            <h3>{p.projectName}</h3>
            <p className="route">
              {p.currentLocation} → {p.destination}
            </p>
            <dl>
              <dt>Move Type</dt>
              <dd>{label(p.moveType)}</dd>
              <dt>PCS Date</dt>
              <dd>{formatDate(p.hardMoveDate)}</dd>
              <dt>Planning Start</dt>
              <dd>{formatDate(p.planningStartDate)}</dd>
              {p.optionalPackoutDate && (
                <>
                  <dt>Pack-out</dt>
                  <dd>{formatDate(p.optionalPackoutDate)}</dd>
                </>
              )}
              <dt>Housing</dt>
              <dd>{label(p.housingAssumption)}</dd>
              <dt>Goal</dt>
              <dd>{label(p.userGoal)}</dd>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
