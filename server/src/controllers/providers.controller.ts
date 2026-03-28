import type { Request, Response } from "express";
import { isClaudeAvailable } from "../providers/claude.provider.js";
import { isEbayAvailable, getAccessToken } from "../providers/ebay.provider.js";
import Anthropic from "@anthropic-ai/sdk";

function maskKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "…" + key.slice(-4);
}

export interface ProviderStatus {
  claude: {
    configured: boolean;
    maskedKey: string | null;
    mode: "live" | "unavailable";
    lastTest?: { ok: boolean; message: string; testedAt: string };
  };
  ebay: {
    configured: boolean;
    maskedAppId: string | null;
    hasCertId: boolean;
    mode: "live" | "unavailable";
    lastTest?: { ok: boolean; message: string; testedAt: string };
  };
  overallMode: "live" | "fallback" | "mock";
}

// In-memory test result cache (resets on server restart)
let claudeLastTest: { ok: boolean; message: string; testedAt: string } | undefined;
let ebayLastTest: { ok: boolean; message: string; testedAt: string } | undefined;

export function getProviderStatus(_req: Request, res: Response): void {
  const claudeConfigured = isClaudeAvailable();
  const ebayConfigured = isEbayAvailable();

  let overallMode: "live" | "fallback" | "mock" = "mock";
  if (claudeConfigured && ebayConfigured) overallMode = "live";
  else if (claudeConfigured || ebayConfigured) overallMode = "fallback";

  const status: ProviderStatus = {
    claude: {
      configured: claudeConfigured,
      maskedKey: maskKey(process.env.ANTHROPIC_API_KEY),
      mode: claudeConfigured ? "live" : "unavailable",
      lastTest: claudeLastTest,
    },
    ebay: {
      configured: ebayConfigured,
      maskedAppId: maskKey(process.env.EBAY_APP_ID),
      hasCertId: !!process.env.EBAY_CERT_ID,
      mode: ebayConfigured ? "live" : "unavailable",
      lastTest: ebayLastTest,
    },
    overallMode,
  };

  res.json(status);
}

export async function testClaude(_req: Request, res: Response): Promise<void> {
  const now = new Date().toISOString();

  if (!isClaudeAvailable()) {
    claudeLastTest = { ok: false, message: "No API key configured", testedAt: now };
    res.json(claudeLastTest);
    return;
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply with only the word: OK" }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    claudeLastTest = { ok: true, message: `Connected — model responded: "${text.trim()}"`, testedAt: now };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    claudeLastTest = { ok: false, message: msg.length > 200 ? msg.slice(0, 200) + "…" : msg, testedAt: now };
  }

  res.json(claudeLastTest);
}

export async function testEbay(_req: Request, res: Response): Promise<void> {
  const now = new Date().toISOString();

  if (!isEbayAvailable()) {
    ebayLastTest = { ok: false, message: "No eBay App ID configured", testedAt: now };
    res.json(ebayLastTest);
    return;
  }

  try {
    const token = await getAccessToken();
    if (!token) {
      ebayLastTest = { ok: false, message: "OAuth token request failed — check EBAY_APP_ID and EBAY_CERT_ID", testedAt: now };
    } else {
      ebayLastTest = { ok: true, message: "Connected — OAuth token obtained successfully", testedAt: now };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ebayLastTest = { ok: false, message: msg.length > 200 ? msg.slice(0, 200) + "…" : msg, testedAt: now };
  }

  res.json(ebayLastTest);
}
