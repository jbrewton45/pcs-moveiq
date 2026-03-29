import { query } from "../data/database.js";
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

export async function listProjects(userId: string): Promise<Project[]> {
  const result = await query('SELECT * FROM projects WHERE "userId" = $1 ORDER BY "createdAt" DESC', [userId]);
  return result.rows.map(r => rowToProject(r as Record<string, unknown>));
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const result = await query('SELECT * FROM projects WHERE id = $1', [id]);
  return result.rows.length > 0 ? rowToProject(result.rows[0] as Record<string, unknown>) : undefined;
}

export async function getProjectForUser(id: string, userId: string): Promise<Project | undefined> {
  const project = await getProjectById(id);
  if (!project) return undefined;
  if (project.userId && project.userId !== userId) return undefined;
  return project;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const id = createId("proj");

  await query(
    `INSERT INTO projects (id, "userId", "projectName", "currentLocation", destination, "moveType",
      "planningStartDate", "hardMoveDate", "optionalPackoutDate", "housingAssumption", "userGoal",
      "weightAllowanceLbs", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id, input.userId, input.projectName, input.currentLocation, input.destination,
      input.moveType, input.planningStartDate, input.hardMoveDate,
      input.optionalPackoutDate ?? null, input.housingAssumption, input.userGoal,
      input.weightAllowanceLbs ?? null, now, now
    ]
  );

  return (await getProjectById(id))!;
}

export async function updateProject(id: string, userId: string, input: UpdateProjectInput): Promise<Project | null> {
  const existing = await getProjectForUser(id, userId);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...input,
    weightAllowanceLbs: input.weightAllowanceLbs !== undefined ? input.weightAllowanceLbs : existing.weightAllowanceLbs,
    updatedAt: new Date().toISOString(),
  };

  await query(
    `UPDATE projects SET "projectName" = $1, "currentLocation" = $2, destination = $3,
      "moveType" = $4, "planningStartDate" = $5, "hardMoveDate" = $6, "optionalPackoutDate" = $7,
      "housingAssumption" = $8, "userGoal" = $9, "weightAllowanceLbs" = $10, "updatedAt" = $11
     WHERE id = $12`,
    [
      updated.projectName, updated.currentLocation, updated.destination,
      updated.moveType, updated.planningStartDate, updated.hardMoveDate,
      updated.optionalPackoutDate ?? null, updated.housingAssumption, updated.userGoal,
      updated.weightAllowanceLbs ?? null, updated.updatedAt, id
    ]
  );

  return (await getProjectById(id))!;
}

export async function deleteProject(id: string, userId: string): Promise<boolean> {
  const existing = await getProjectForUser(id, userId);
  if (!existing) return false;
  const result = await query('DELETE FROM projects WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
