import { Router } from "express";
import crypto from "crypto";
import type { Request, Response } from "express";

export const ebayRouter = Router();

/**
 * GET /ebay/notifications — eBay marketplace account deletion challenge verification.
 *
 * eBay sends a challenge_code query param. We must respond with:
 *   SHA-256( challengeCode + verificationToken + endpoint )
 * as hex in { "challengeResponse": "<hash>" }.
 *
 * Ref: https://developer.ebay.com/marketplace-account-deletion
 */
ebayRouter.get("/notifications", (req: Request, res: Response) => {
  const challengeCode = req.query.challenge_code as string | undefined;

  if (!challengeCode) {
    console.warn("[eBay] GET /ebay/notifications — missing challenge_code");
    res.status(400).json({ error: "Missing challenge_code query parameter" });
    return;
  }

  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  const endpoint = process.env.EBAY_NOTIFICATION_ENDPOINT;

  if (!verificationToken || !endpoint) {
    console.error("[eBay] GET /ebay/notifications — EBAY_VERIFICATION_TOKEN or EBAY_NOTIFICATION_ENDPOINT not set");
    res.status(500).json({ error: "Server misconfigured — notification secrets missing" });
    return;
  }

  const hash = crypto
    .createHash("sha256")
    .update(challengeCode + verificationToken + endpoint)
    .digest("hex");

  res.status(200).json({ challengeResponse: hash });
});

/**
 * POST /ebay/notifications — eBay marketplace account deletion notification.
 *
 * Acknowledge immediately with 200. Log the notification topic for observability.
 * No database changes — eBay only requires a timely ack.
 */
ebayRouter.post("/notifications", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | undefined;
  const topic = (body?.metadata as Record<string, unknown>)?.topic ?? "unknown";
  console.log(`[eBay] POST /ebay/notifications — topic: ${String(topic)}`);
  res.status(200).json({ status: "acknowledged" });
});
