import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod/v4";
import { computeDecision } from "../services/item-decision.service.js";
import type { DecisionInput } from "../services/item-decision.service.js";

export const decisionRouter = Router();

const DecisionInputSchema = z.object({
  itemName: z.string().min(1),
  category: z.string().min(1),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]),
  sizeClass: z.enum(["SMALL", "MEDIUM", "LARGE", "OVERSIZED"]),
  weightLbs: z.number().positive().optional(),
  priceFairMarket: z.number().nonnegative().optional(),
  priceFastSale: z.number().nonnegative().optional(),
  ebayAvgPrice: z.number().nonnegative().optional(),
  ebayMedianPrice: z.number().nonnegative().optional(),
  ebayLowPrice: z.number().nonnegative().optional(),
  ebayHighPrice: z.number().nonnegative().optional(),
  ebayListingCount: z.number().int().nonnegative().optional(),
  pcsDate: z.string().date().optional(),
  intent: z.enum(["sell", "keep", "ship", "donate", "undecided", "discarded"]).optional(),
});

const BatchDecisionSchema = z.object({
  items: z.array(DecisionInputSchema).min(1).max(200),
});

decisionRouter.post("/decision", (req: Request, res: Response) => {
  const parsed = DecisionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  res.status(200).json(computeDecision(parsed.data as DecisionInput));
});

decisionRouter.post("/decision/batch", (req: Request, res: Response) => {
  const parsed = BatchDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  res.status(200).json(parsed.data.items.map(item => computeDecision(item as DecisionInput)));
});
