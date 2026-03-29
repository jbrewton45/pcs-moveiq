import { query } from "../data/database.js";
import type { Room } from "../types/domain.js";
import { createId } from "../utils/id.js";

interface CreateRoomInput {
  projectId: string;
  roomName: string;
  roomType: string;
}

interface UpdateRoomInput {
  roomName?: string;
  roomType?: string;
}

function rowToRoom(row: Record<string, unknown>): Room {
  return row as unknown as Room;
}

export async function listRoomsByProject(projectId: string): Promise<Room[]> {
  const result = await query('SELECT * FROM rooms WHERE "projectId" = $1 ORDER BY "createdAt" ASC', [projectId]);
  return result.rows.map(r => rowToRoom(r as Record<string, unknown>));
}

export async function getRoomById(id: string): Promise<Room | undefined> {
  const result = await query('SELECT * FROM rooms WHERE id = $1', [id]);
  return result.rows.length > 0 ? rowToRoom(result.rows[0] as Record<string, unknown>) : undefined;
}

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const now = new Date().toISOString();
  const id = createId("room");

  await query(
    `INSERT INTO rooms (id, "projectId", "roomName", "roomType", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.projectId, input.roomName, input.roomType, now, now]
  );

  return (await getRoomById(id))!;
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<Room | null> {
  const existing = await getRoomById(id);
  if (!existing) return null;

  const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };

  await query(
    `UPDATE rooms SET "roomName" = $1, "roomType" = $2, "updatedAt" = $3 WHERE id = $4`,
    [updated.roomName, updated.roomType, updated.updatedAt, id]
  );

  return (await getRoomById(id))!;
}

export async function deleteRoom(id: string): Promise<boolean> {
  const result = await query('DELETE FROM rooms WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
