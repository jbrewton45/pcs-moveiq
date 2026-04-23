import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import type { Item, ItemStatus } from "../types/domain.js";
import { bulkDeleteItems, bulkUpdateStatus, createItem, deleteItem, getItemById, listItemsByProject, listItemsByRoom, updateItem, updateItemPlacement, updateItemListing, updateItemSoldPrice, applyItemAction, applyBulkItemAction, PlacementValidationError, submitClarifications, ItemActionConflictError, isItemCompleted } from "../services/items.service.js";
import { getProjectById } from "../services/projects.service.js";
import { getRoomById } from "../services/rooms.service.js";
import { prioritizeProject } from "../services/decisions.service.js";
import { BulkDeleteSchema, BulkItemActionSchema, BulkUpdateStatusSchema, CreateItemSchema, ItemActionSchema, ItemPlacementSchema, UpdateItemListingSchema, UpdateItemSchema, UpdateItemSoldPriceSchema } from "../validation/schemas.js";
import { rowToItem } from "../utils/converters.js";
import { z } from "zod/v4";
import { parseVoiceTranscript, parseVoiceWithPhoto } from "../services/voice.service.js";
import { identifyItem } from "../services/identification.service.js";
import { generatePricing } from "../services/pricing.service.js";

export async function getPrioritizedHandler(req: Request, res: Response) {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await getProjectById(projectId))) return res.status(404).json({ error: "Project not found" });
  const limitRaw = req.query.limit as string | undefined;
  const limit = limitRaw != null ? Number.parseInt(limitRaw, 10) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit < 1 || limit > 100)) {
    return res.status(400).json({ error: "limit must be an integer in [1, 100]" });
  }
  return res.status(200).json(await prioritizeProject(projectId, { limit }));
}

export async function getItems(req: Request, res: Response) {
  const projectId = req.query.projectId as string | undefined;
  const roomId = req.query.roomId as string | undefined;

  if (roomId) {
    return res.status(200).json(await listItemsByRoom(roomId));
  }

  if (projectId) {
    return res.status(200).json(await listItemsByProject(projectId));
  }

  return res.status(400).json({ error: "projectId or roomId is required" });
}

export async function postItem(req: Request, res: Response) {
  const result = CreateItemSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }

  if (!(await getProjectById(result.data.projectId))) {
    return res.status(404).json({ error: "Project not found" });
  }

  const room = await getRoomById(result.data.roomId);
  if (!room || room.projectId !== result.data.projectId) {
    return res.status(400).json({ error: "Room does not belong to this project" });
  }

  let item = await createItem(result.data);
  // If the caller supplied an intent field, record the decision via applyItemAction
  // so item_decisions is populated immediately after item creation.
  if (result.data.intent) {
    const intentResult = await applyItemAction(item.id, result.data.intent);
    if (intentResult) item = intentResult.item;
  }
  return res.status(201).json(item);
}

export async function putItem(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = UpdateItemSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  }
  const item = await updateItem(id, result.data);
  if (!item) return res.status(404).json({ error: "Item not found" });
  return res.status(200).json(item);
}

export async function postItemActionHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = ItemActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }
  try {
    const result = await applyItemAction(id, parsed.data.action, { soldPriceUsd: parsed.data.soldPriceUsd });
    if (!result) return res.status(404).json({ error: "Item not found" });
    return res.status(200).json(result.item);
  } catch (err) {
    if (err instanceof ItemActionConflictError) {
      return res.status(409).json({
        error: err.message,
        existingStatus: err.existingStatus,
        existingSoldPriceUsd: err.existingSoldPriceUsd,
      });
    }
    throw err;
  }
}

export async function postBulkItemActionHandler(req: Request, res: Response) {
  const parsed = BulkItemActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }
  const updated = await applyBulkItemAction(parsed.data.itemIds, parsed.data.action);
  return res.status(200).json({ updated: updated.length, items: updated });
}

export async function putItemListingHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateItemListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }
  const updated = await updateItemListing(id, parsed.data.listingUrl);
  if (!updated) return res.status(404).json({ error: "Item not found" });
  return res.status(200).json(updated);
}

export async function putItemSoldPriceHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateItemSoldPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }
  const updated = await updateItemSoldPrice(id, parsed.data.soldPriceUsd);
  if (!updated) return res.status(404).json({ error: "Item not found" });
  return res.status(200).json(updated);
}

export async function putItemPlacementHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = ItemPlacementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }
  try {
    const updated = await updateItemPlacement(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Item not found" });
    return res.status(200).json(updated);
  } catch (err) {
    if (err instanceof PlacementValidationError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
}

export async function removeItem(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = await deleteItem(id);
  if (!deleted) return res.status(404).json({ error: "Item not found" });
  return res.status(204).send();
}

export async function bulkUpdateItemStatus(req: Request, res: Response) {
  const result = BulkUpdateStatusSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  const count = await bulkUpdateStatus(result.data.itemIds, result.data.status as ItemStatus);
  return res.status(200).json({ updated: count });
}

export async function bulkDeleteItemsHandler(req: Request, res: Response) {
  const result = BulkDeleteSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "Validation failed", details: result.error.issues });
  const count = await bulkDeleteItems(result.data.itemIds);
  return res.status(200).json({ deleted: count });
}

const SubmitClarificationsSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

export async function submitClarificationsHandler(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const parse = SubmitClarificationsSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Validation failed", details: parse.error.issues });
  }

  const updated = await submitClarifications(id, parse.data.answers);
  if (!updated) return res.status(404).json({ error: "Item not found" });

  return res.status(200).json(updated);
}

export async function parseVoice(req: Request, res: Response) {
  const { transcript, roomType } = req.body as { transcript?: string; roomType?: string };
  if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
    return res.status(400).json({ error: "transcript is required" });
  }
  const result = await parseVoiceTranscript(transcript.trim(), roomType);
  if (result.sentimental && result.notes != null) {
    result.notes = "[Sentimental] " + result.notes;
  }
  return res.status(200).json(result);
}

export async function parseVoicePhoto(req: Request, res: Response) {
  const transcriptRaw = req.body?.transcript;
  const transcript = typeof transcriptRaw === "string" ? transcriptRaw : undefined;
  const roomType = req.body?.roomType as string | undefined;

  const file = (req as unknown as { file?: { filename: string } }).file;

  const hasTranscript = typeof transcript === "string" && transcript.trim().length > 0;

  if (!hasTranscript && !file) {
    return res.status(400).json({ error: "transcript or photo is required" });
  }

  if (file) {
    const result = await parseVoiceWithPhoto(hasTranscript ? transcript!.trim() : "", file.filename, roomType);
    const filePath = path.join(process.cwd(), "uploads", file.filename);
    fs.unlink(filePath, () => {});
    if (result.sentimental && result.notes != null) {
      result.notes = "[Sentimental] " + result.notes;
    }
    return res.status(200).json(result);
  }

  const result = await parseVoiceTranscript(transcript!.trim(), roomType);
  if (result.sentimental && result.notes != null) {
    result.notes = "[Sentimental] " + result.notes;
  }
  return res.status(200).json(result);
}

export async function batchIdentifyPrice(req: Request, res: Response) {
  const { itemIds } = req.body as { itemIds?: string[] };
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ error: "itemIds array is required" });
  }

  const ids = itemIds.slice(0, 20);

  const results: Array<{
    itemId: string;
    status: "complete" | "no_estimate" | "error" | "skipped_completed";
    item?: Item;
  }> = [];

  for (const id of ids) {
    try {
      // Skip items that are already in a terminal state — they are done and
      // should not have identification or pricing re-run on them.
      const existingItem = await getItemById(id);
      if (existingItem && isItemCompleted(existingItem.status)) {
        results.push({ itemId: id, status: "skipped_completed", item: existingItem });
        continue;
      }

      const identResult = await identifyItem(id);
      if (!identResult) {
        results.push({ itemId: id, status: "error" });
        continue;
      }

      if (identResult.item.identificationStatus === "NONE") {
        await identifyItem(id);
      }

      const pricingResult = await generatePricing(id);
      if (!pricingResult) {
        results.push({ itemId: id, status: "error" });
        continue;
      }

      const finalItem = pricingResult.item;
      results.push({
        itemId: id,
        status: finalItem.priceFairMarket != null ? "complete" : "no_estimate",
        item: finalItem,
      });
    } catch (err) {
      console.error(`Batch process failed for item ${id}:`, err instanceof Error ? err.message : err);
      results.push({ itemId: id, status: "error" });
    }
  }

  return res.status(200).json({ results });
}
