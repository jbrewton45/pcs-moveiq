import { Router } from "express";
import type { Request, Response } from "express";
import { analyzeEbayPricing } from "../services/ebay-pricing-analysis.service.js";

export const ebayAnalysisRouter = Router();

/**
 * GET /api/ebay/analyze?q=<query>&limit=50
 *
 * Returns grouped comparable analysis with pricing tiers,
 * confidence scoring, and exclusion reasons.
 */
ebayAnalysisRouter.get("/analyze", async (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: "q query parameter is required" });
    return;
  }

  const limit = parseInt(req.query.limit as string, 10) || 50;

  try {
    const result = await analyzeEbayPricing(q, limit);

    if (!result) {
      res.status(502).json({ error: "eBay search unavailable" });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("[eBay Analysis] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Analysis failed" });
  }
});
