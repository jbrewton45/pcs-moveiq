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

// ── Orphan detection ────────────────────────────────────────────────────────

export interface OrphanedItem {
  itemId: string;
  itemName: string;
  /** The roomObjectId currently stored on the item but missing from the scan. */
  previousObjectId: string;
}

/**
 * Return items in this room whose `roomObjectId` is no longer present in the
 * current scan's `objects` array — i.e. a rescan dropped the referenced
 * detection. Items without any `roomObjectId`, or items whose objectId is still
 * in the scan, are NOT returned. If the room has no scan at all and there are
 * items with roomObjectId, they count as orphaned too (the referenced scan is
 * gone entirely).
 */
export async function getOrphanedItems(roomId: string): Promise<OrphanedItem[]> {
  const scanResult = await query(
    'SELECT objects FROM room_scans WHERE "roomId" = $1 LIMIT 1',
    [roomId]
  );

  const validObjectIds = new Set<string>();
  if (scanResult.rows.length > 0) {
    const raw = (scanResult.rows[0] as { objects: unknown }).objects;
    const parsed: Array<{ objectId?: string }> = Array.isArray(raw)
      ? (raw as Array<{ objectId?: string }>)
      : typeof raw === "string"
        ? (JSON.parse(raw) as Array<{ objectId?: string }>)
        : [];
    for (const o of parsed) {
      if (o && typeof o.objectId === "string") validObjectIds.add(o.objectId);
    }
  }

  const itemsResult = await query(
    `SELECT id, "itemName", "roomObjectId"
       FROM items
      WHERE "roomId" = $1
        AND "roomObjectId" IS NOT NULL`,
    [roomId]
  );

  const orphaned: OrphanedItem[] = [];
  for (const row of itemsResult.rows) {
    const r = row as { id: string; itemName: string; roomObjectId: string };
    if (!validObjectIds.has(r.roomObjectId)) {
      orphaned.push({
        itemId: r.id,
        itemName: r.itemName,
        previousObjectId: r.roomObjectId,
      });
    }
  }
  return orphaned;
}
