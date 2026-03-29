import { db } from "../data/database.js";
import type { HousingAssumption, MoveType, Project, UserGoal } from "../types/domain.js";
import { createId } from "../utils/id.js";

interface CreateProjectInput {
  userId: string;
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
  if (p.userId === null) p.userId = undefined;
  return p as unknown as Project;
}

export function listProjects(userId: string): Project[] {
  const rows = db.prepare("SELECT * FROM projects WHERE userId = ? ORDER BY createdAt DESC").all(userId);
  return rows.map(r => rowToProject(r as Record<string, unknown>));
}

export function getProjectById(id: string): Project | undefined {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? rowToProject(row as Record<string, unknown>) : undefined;
}

export function getProjectForUser(id: string, userId: string): Project | undefined {
  const project = getProjectById(id);
  if (!project) return undefined;
  // Allow access to unowned projects (migration) or owned projects
  if (project.userId && project.userId !== userId) return undefined;
  return project;
}

export function createProject(input: CreateProjectInput): Project {
  const now = new Date().toISOString();
  const id = createId("proj");

  db.prepare(`
    INSERT INTO projects (id, userId, projectName, currentLocation, destination, moveType,
      planningStartDate, hardMoveDate, optionalPackoutDate, housingAssumption, userGoal,
      weightAllowanceLbs, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.userId, input.projectName, input.currentLocation, input.destination,
    input.moveType, input.planningStartDate, input.hardMoveDate,
    input.optionalPackoutDate ?? null, input.housingAssumption, input.userGoal,
    input.weightAllowanceLbs ?? null, now, now
  );

  return getProjectById(id)!;
}

export function updateProject(id: string, userId: string, input: UpdateProjectInput): Project | null {
  const existing = getProjectForUser(id, userId);
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

export function deleteProject(id: string, userId: string): boolean {
  const existing = getProjectForUser(id, userId);
  if (!existing) return false;
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  return result.changes > 0;
}
