import type { Request, Response } from "express";
import { z } from "zod/v4";
import { identifyItem, confirmIdentification } from "../services/identification.service.js";
import { generatePricing, getItemComparables } from "../services/pricing.service.js";
import { correctAndReprice } from "../services/identification-correction.service.js";
import { ItemBusyError } from "../utils/item-lock.js";

const CATEGORY_ENUM = [
  "Furniture", "Electronics", "Appliance", "Kitchen", "Tools",
  "Sporting Goods", "Outdoor", "Toys", "Clothing", "Decor",
  "Media", "Linens", "Baby", "Pet", "Office", "Other",
] as const;

const CorrectAndRepriceSchema = z.object({
  identifiedName: z.string().trim().min(1).max(200),
  identifiedCategory: z.enum(CATEGORY_ENUM),
  identifiedBrand: z.string().trim().max(100).nullable().optional()
    .transform(v => (v && v.length > 0 ? v : null)),
  identifiedModel: z.string().trim().max(100).nullable().optional()
    .transform(v => (v && v.length > 0 ? v : null)),
});

export async function postIdentify(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = await identifyItem(id);
  if (!result) return res.status(404).json({ error: "Item not found" });
  return res.status(200).json({
    ...result.item,
    provider: result.provider,
    providerAvailable: result.providerAvailable,
  });
}

export async function postConfirmIdentification(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const edits = req.body && Object.keys(req.body).length > 0 ? req.body : undefined;
  const item = await confirmIdentification(id, edits);
  if (!item) return res.status(404).json({ error: "Item not found" });
  return res.status(200).json(item);
}

export async function postPricing(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = await generatePricing(id);
  if (!result) return res.status(404).json({ error: "Item not found" });
  return res.status(200).json(result);
}

export async function getComparables(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const comparables = await getItemComparables(id);
  return res.status(200).json(comparables);
}

export async function postCorrectAndReprice(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) return res.status(400).json({ error: "Missing item id" });

  const parse = CorrectAndRepriceSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }

  try {
    const result = await correctAndReprice(id, parse.data);
    if (!result) return res.status(404).json({ error: "Item not found" });
    return res.json(result);
  } catch (err) {
    if (err instanceof ItemBusyError) {
      return res.status(409).json({ error: "Item is already being updated. Try again in a moment." });
    }
    const msg = err instanceof Error ? err.message : "Correction failed";
    return res.status(500).json({ error: msg });
  }
}
