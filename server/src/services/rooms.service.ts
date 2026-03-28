import { db } from "../data/database.js";
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

export function listRoomsByProject(projectId: string): Room[] {
  const rows = db.prepare("SELECT * FROM rooms WHERE projectId = ? ORDER BY createdAt ASC").all(projectId);
  return rows.map(r => rowToRoom(r as Record<string, unknown>));
}

export function getRoomById(id: string): Room | undefined {
  const row = db.prepare("SELECT * FROM rooms WHERE id = ?").get(id);
  return row ? rowToRoom(row as Record<string, unknown>) : undefined;
}

export function createRoom(input: CreateRoomInput): Room {
  const now = new Date().toISOString();
  const id = createId("room");

  db.prepare(`
    INSERT INTO rooms (id, projectId, roomName, roomType, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.projectId, input.roomName, input.roomType, now, now);

  return getRoomById(id)!;
}

export function updateRoom(id: string, input: UpdateRoomInput): Room | null {
  const existing = getRoomById(id);
  if (!existing) return null;

  const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };

  db.prepare(`
    UPDATE rooms SET roomName = ?, roomType = ?, updatedAt = ? WHERE id = ?
  `).run(updated.roomName, updated.roomType, updated.updatedAt, id);

  return getRoomById(id)!;
}

export function deleteRoom(id: string): boolean {
  // CASCADE handles items deletion automatically
  const result = db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
  return result.changes > 0;
}
