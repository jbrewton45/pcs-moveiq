import { db } from "../data/database.js";
import type { HousingAssumption, MoveType, Project, UserGoal } from "../types/domain.js";
import { createId } from "../utils/id.js";

interface CreateProjectInput {
  projectName: string;
  currentLocation: string;
  destination: string;
  moveType: MoveType;
  planningStartDate: string;
  hardMoveDate: string;
  optionalPackoutDate?: string;
  housingAssumption: HousingAssumption;
  userGoal: UserGoal;
  weightAllowanceLbs?: number;
}

interface UpdateProjectInput {
  projectName?: string;
  currentLocation?: string;
  destination?: string;
  moveType?: MoveType;
  planningStartDate?: string;
  hardMoveDate?: string;
  optionalPackoutDate?: string;
  housingAssumption?: HousingAssumption;
  userGoal?: UserGoal;
  weightAllowanceLbs?: number | null;
}

function rowToProject(row: Record<string, unknown>): Project {
  const p = { ...row } as Record<string, unknown>;
  if (p.optionalPackoutDate === null) delete p.optionalPackoutDate;
  if (p.weightAllowanceLbs === null) delete p.weightAllowanceLbs;
  return p as unknown as Project;
}

export function listProjects(): Project[] {
  const rows = db.prepare("SELECT * FROM projects ORDER BY createdAt DESC").all();
  return rows.map(r => rowToProject(r as Record<string, unknown>));
}

export function getProjectById(id: string): Project | undefined {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? rowToProject(row as Record<string, unknown>) : undefined;
}

export function createProject(input: CreateProjectInput): Project {
  const now = new Date().toISOString();
  const id = createId("proj");
  const project: Project = {
    id,
    ...input,
    optionalPackoutDate: input.optionalPackoutDate ?? null as unknown as undefined,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO projects (id, projectName, currentLocation, destination, moveType,
      planningStartDate, hardMoveDate, optionalPackoutDate, housingAssumption, userGoal,
      weightAllowanceLbs, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    project.id, project.projectName, project.currentLocation, project.destination,
    project.moveType, project.planningStartDate, project.hardMoveDate,
    project.optionalPackoutDate ?? null, project.housingAssumption, project.userGoal,
    input.weightAllowanceLbs ?? null, project.createdAt, project.updatedAt
  );

  return getProjectById(id)!;
}

export function updateProject(id: string, input: UpdateProjectInput): Project | null {
  const existing = getProjectById(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...input,
    weightAllowanceLbs: input.weightAllowanceLbs !== undefined ? input.weightAllowanceLbs : existing.weightAllowanceLbs,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE projects SET projectName = ?, currentLocation = ?, destination = ?,
      moveType = ?, planningStartDate = ?, hardMoveDate = ?, optionalPackoutDate = ?,
      housingAssumption = ?, userGoal = ?, weightAllowanceLbs = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    updated.projectName, updated.currentLocation, updated.destination,
    updated.moveType, updated.planningStartDate, updated.hardMoveDate,
    updated.optionalPackoutDate ?? null, updated.housingAssumption, updated.userGoal,
    updated.weightAllowanceLbs ?? null, updated.updatedAt, id
  );

  return getProjectById(id)!;
}

export function deleteProject(id: string): boolean {
  // CASCADE handles rooms and items deletion automatically
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  return result.changes > 0;
}
