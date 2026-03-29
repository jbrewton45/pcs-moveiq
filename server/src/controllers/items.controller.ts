import type { Request, Response } from "express";
import type { ItemStatus } from "../types/domain.js";
import { bulkDeleteItems, bulkUpdateStatus, createItem, deleteItem, listItemsByProject, listItemsByRoom, updateItem } from "../services/items.service.js";
import { getProjectById } from "../services/projects.service.js";
import { getRoomById } from "../services/rooms.service.js";
import { BulkDeleteSchema, BulkUpdateStatusSchema, CreateItemSchema, UpdateItemSchema } from "../validation/schemas.js";
import { db } from "../data/database.js";
import { rowToItem } from "../utils/converters.js";
import { z } from "zod/v4";
import { parseVoiceTranscript } from "../services/voice.service.js";

export function getItems(req: Request, res: Response) {
  const projectId = req.query.projectId as string | undefined;
  const roomId = req.query.roomId as string | undefined;

  if (roomId) {
    return res.status(200).json(listItemsByRoom(roomId));
  }

  if (projectId) {
    return res.status(200).json(listItemsByProject(projectId));
  }

  return res.status(400).json({ error: "projectId or roomId is required" });
}

export function postItem(req: Request, res: Response) {
  const result = CreateItemSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }

  if (!getProjectById(result.data.projectId)) {
    return res.status(404).json({ error: "Project not found" });
  }

  const room = getRoomById(result.data.roomId);
  if (!room || room.projectId !== result.data.projectId) {
    return res.status(400).json({ error: "Room does not belong to this project" });
  }

  const item = createItem(result.data);
  return res.status(201).json(item);
}

export function putItem(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = UpdateItemSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }
  const item = updateItem(id, result.data);
  if (!item) return res.status(404).json({ error: "Item not found" });
  return res.status(200).json(item);
}

export function removeItem(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = deleteItem(id);
  if (!deleted) return res.status(404).json({ error: "Item not found" });
  return res.status(204).send();
}

export function bulkUpdateItemStatus(req: Request, res: Response) {
  const result = BulkUpdateStatusSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  const count = bulkUpdateStatus(result.data.itemIds, result.data.status as ItemStatus);
  return res.status(200).json({ updated: count });
}

export function bulkDeleteItemsHandler(req: Request, res: Response) {
  const result = BulkDeleteSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  const count = bulkDeleteItems(result.data.itemIds);
  return res.status(200).json({ deleted: count });
}

const SubmitClarificationsSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

export function submitClarifications(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const parse = SubmitClarificationsSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Validation failed", details: parse.error.issues });
  }

  // Verify item exists
  const existing = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  if (!existing) {
    return res.status(404).json({ error: "Item not found" });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE items SET
      clarificationAnswers = ?,
      pendingClarifications = NULL,
      updatedAt = ?
    WHERE id = ?
  `).run(JSON.stringify(parse.data.answers), now, id);

  const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  if (!updated) return res.status(404).json({ error: "Item not found" });

  return res.status(200).json(rowToItem(updated as Record<string, unknown>));
}

export async function parseVoice(req: Request, res: Response) {
  const { transcript, roomType } = req.body as { transcript?: string; roomType?: string };
  if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
    return res.status(400).json({ error: "transcript is required" });
  }
  const result = await parseVoiceTranscript(transcript.trim(), roomType);
  return res.status(200).json(result);
}
