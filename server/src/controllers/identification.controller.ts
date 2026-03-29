import type { Request, Response } from "express";
import { identifyItem, confirmIdentification } from "../services/identification.service.js";
import { generatePricing, getItemComparables } from "../services/pricing.service.js";

export async function postIdentify(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const item = await identifyItem(id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  return res.status(200).json(item);
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
