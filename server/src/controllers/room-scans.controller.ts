import type { Request, Response } from "express";
import { getRoomById, getOrphanedItems } from "../services/rooms.service.js";
import { getRoomScan, upsertRoomScan, updateRoomObjectLabel } from "../services/room-scans.service.js";
import { RoomScanPayloadSchema, UpdateRoomObjectSchema } from "../validation/schemas.js";

/**
 * GET /api/rooms/:id/scan
 * Returns the most-recent scan for the room, or 404 if none yet.
 */
export async function getRoomScanHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const room = await getRoomById(id);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const scan = await getRoomScan(id);
  if (!scan) return res.status(404).json({ error: "No scan for this room yet" });

  return res.status(200).json(scan);
}

/**
 * PUT /api/rooms/:id/scan
 * Upserts the scan for the room. The body must match RoomScanPayloadSchema.
 * One scan per room — any previous scan is replaced atomically.
 */
export async function putRoomScanHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const room = await getRoomById(id);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const parsed = RoomScanPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.issues,
    });
  }

  const scan = await upsertRoomScan(id, parsed.data);
  return res.status(200).json(scan);
}

/**
 * GET /api/rooms/:id/orphaned-items
 * Returns items in the room whose roomObjectId no longer exists in the current
 * scan — i.e. a rescan dropped the previously-detected object. Returns [] when
 * no scan exists is *not* the behavior — with no scan, any roomObjectId-set
 * items ARE orphaned; this matches getOrphanedItems() in the service.
 */
export async function getOrphanedItemsHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const room = await getRoomById(id);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const orphaned = await getOrphanedItems(id);
  return res.status(200).json(orphaned);
}

/**
 * Phase 16: PUT /api/rooms/:id/object/:objectId
 * Body: { userLabel: string | null }
 *
 * Writes a user-supplied override label on a scanned object. The original
 * `label` is preserved. Send `null` to clear the override.
 */
export async function putRoomObjectHandler(req: Request, res: Response) {
  const roomId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const objectId = Array.isArray(req.params.objectId) ? req.params.objectId[0] : req.params.objectId;

  const room = await getRoomById(roomId);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const parsed = UpdateRoomObjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.issues,
    });
  }

  const updated = await updateRoomObjectLabel(roomId, objectId, parsed.data.userLabel);
  if (!updated) {
    return res.status(404).json({ error: "Scan or object not found" });
  }

  return res.status(200).json(updated);
}
