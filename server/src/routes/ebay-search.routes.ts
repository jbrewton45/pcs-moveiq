import { Router } from "express";
import type { Request, Response } from "express";
import { searchEbayListings } from "../services/ebay-search.service.js";
import { searchEbaySoldListings } from "../services/ebay-sold.service.js";

export const ebaySearchRouter = Router();

/**
 * GET /api/ebay/search?q=<query>&limit=10&offset=0&filter=...
 *
 * Public listing search via eBay Browse API. Server-side only —
 * no eBay credentials are exposed to the client.
 */
ebaySearchRouter.get("/search", async (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: "q query parameter is required" });
    return;
  }

  const limit = parseInt(req.query.limit as string, 10) || 10;
  const offset = parseInt(req.query.offset as string, 10) || 0;
  const filter = req.query.filter as string | undefined;

  const result = await searchEbayListings(q, limit, offset, filter);

  if (!result) {
    res.status(502).json({ error: "eBay search unavailable" });
    return;
  }

  res.status(200).json(result);
});

/**
 * GET /api/ebay/search/sold?q=<query>&condition=GOOD&keywords=extra+terms&limit=20
 *
 * Returns sold/completed eBay listings via the Finding API.
 * Only items that actually SOLD are included (not unsold completed auctions).
 * Prices are aggregated with IQR outlier removal.
 */
ebaySearchRouter.get("/search/sold", async (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: "q query parameter is required" });
    return;
  }

  const condition = (req.query.condition as string | undefined)?.trim();
  const keywords = (req.query.keywords as string | undefined)?.trim();
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

  const result = await searchEbaySoldListings(q, condition, keywords, limit);

  if (!result) {
    res.status(502).json({ error: "eBay sold listings search unavailable" });
    return;
  }

  res.status(200).json(result);
});
