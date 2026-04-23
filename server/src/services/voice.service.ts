import fs from "fs";
import path from "path";
import { isClaudeAvailable } from "../providers/claude.provider.js";
import { isOpenAIAvailable } from "../providers/openai.provider.js";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export interface ParsedVoiceItem {
  itemName: string;
  category: string;
  condition: string;
  sizeClass: string;
  notes: string;
  intent?: "keep" | "sell" | "ship" | "donate";
  sentimental: boolean;
}

export async function parseVoiceTranscript(
  transcript: string,
  roomType?: string,
): Promise<ParsedVoiceItem> {
  const prompt = buildParsePrompt(transcript, roomType);

  // Try Claude first, then OpenAI, then basic fallback
  if (isClaudeAvailable()) {
    const result = await tryClaudeParse(prompt);
    if (result) return result;
  }
  if (isOpenAIAvailable()) {
    const result = await tryOpenAIParse(prompt);
    if (result) return result;
  }

  // Basic fallback — just use the transcript as item name
  return {
    itemName: transcript.trim().slice(0, 100),
    category: guessCategoryFromRoom(roomType),
    condition: "GOOD",
    sizeClass: "MEDIUM",
    notes: transcript,
    intent: undefined,
    sentimental: false,
  };
}

/**
 * Parse a voice transcript combined with a photo for richer, more accurate
 * item identification. Uses vision-capable models (Claude first, then GPT-4o).
 * Falls back to text-only parsing if no vision model is available.
 */
export async function parseVoiceWithPhoto(
  transcript: string,
  photoFilename: string,
  roomType?: string,
): Promise<ParsedVoiceItem> {
  const isPhotoOnly = !transcript || transcript.trim().length === 0;
  const prompt = isPhotoOnly
    ? buildParsePromptPhotoOnly(roomType)
    : buildParsePromptWithPhoto(transcript, roomType);

  // Try vision-capable models: Claude first, then OpenAI
  if (isClaudeAvailable()) {
    const result = await tryClaudeParseWithPhoto(prompt, photoFilename);
    if (result) return result;
  }
  if (isOpenAIAvailable()) {
    const result = await tryOpenAIParseWithPhoto(prompt, photoFilename);
    if (result) return result;
  }

  // If photo-only, don't fall through to text-only parse (empty transcript
  // would yield an empty itemName). Return a minimal safe default instead.
  if (isPhotoOnly) {
    return {
      itemName: "Unknown item",
      category: guessCategoryFromRoom(roomType),
      condition: "GOOD",
      sizeClass: "MEDIUM",
      notes: "",
      intent: undefined,
      sentimental: false,
    };
  }

  // Fallback to text-only parse (voice+photo with non-empty transcript)
  return parseVoiceTranscript(transcript, roomType);
}

function buildParsePromptPhotoOnly(roomType?: string): string {
  return `Identify the item in the provided PHOTO for a military PCS move inventory. No spoken description is available — rely on the image alone.

${roomType ? `Room: ${roomType}` : ""}

Return a JSON object:
{
  "itemName": "concise item name (e.g. 'Sony A7R III Camera Body')",
  "category": "one of: Furniture, Electronics, Appliance, Keepsake, Media, Linens, Decor, Tools, Sports, Clothing, Other",
  "condition": "one of: NEW, LIKE_NEW, GOOD, FAIR, POOR",
  "sizeClass": "one of: SMALL, MEDIUM, LARGE, OVERSIZED",
  "notes": "any extra details visible in the photo (accessories, bundles, visible damage, configuration details, etc.)",
  "intent": null,
  "sentimental": false
}

Rules:
- Identify the item from the PHOTO ALONE — there is no transcript to reference
- Extract the most specific item name possible — include brand and model when visible in the photo
- If the brand/model is not clearly visible, use a descriptive generic name (e.g. 'Black leather recliner', 'Stainless steel microwave')
- Assess condition from visual evidence: visible scratches, wear marks, or damage should lower condition from GOOD; pristine items can be LIKE_NEW or NEW
- Size: SMALL (fits in a box), MEDIUM (chair-sized), LARGE (couch/desk), OVERSIZED (piano/treadmill)
- Notes should capture accessory/bundle info visible in the photo: "with lens", "includes case", "body only", etc.
- intent defaults to null and sentimental defaults to false (no user speech to infer intent from photo alone)
- Return ONLY the JSON object`;
}

function buildParsePrompt(transcript: string, roomType?: string): string {
  return `Parse this spoken item description into structured fields for a military PCS move inventory.

Transcript: "${transcript}"
${roomType ? `Room: ${roomType}` : ""}

Return a JSON object:
{
  "itemName": "concise item name (e.g. 'Sony A7R III Camera Body')",
  "category": "one of: Furniture, Electronics, Appliance, Keepsake, Media, Linens, Decor, Tools, Sports, Clothing, Other",
  "condition": "one of: NEW, LIKE_NEW, GOOD, FAIR, POOR",
  "sizeClass": "one of: SMALL, MEDIUM, LARGE, OVERSIZED",
  "notes": "any extra details from transcript not captured above (accessories, bundles, damage notes, etc.)",
  "intent": "keep" or "sell" or "ship" or "donate" or null (null if user expressed no clear intent),
  "sentimental": true or false (true if user expressed sentimental attachment, family heirloom, irreplaceable, etc.)
}

Rules:
- Extract the most specific item name possible from the transcript
- Include brand and model in itemName when mentioned
- Condition defaults to GOOD unless they mention damage, wear, new, etc.
- Size: SMALL (fits in a box), MEDIUM (chair-sized), LARGE (couch/desk), OVERSIZED (piano/treadmill)
- Notes should capture accessory/bundle info: "with lens", "includes case", "body only", etc.
- intent: use "keep" if user said they want to keep it, "sell" if they want to sell it, "ship" if they want to ship it, "donate" if they want to donate it, null otherwise
- Return ONLY the JSON object`;
}

function buildParsePromptWithPhoto(transcript: string, roomType?: string): string {
  return `Parse this spoken item description into structured fields for a military PCS move inventory.

Transcript: "${transcript}"
${roomType ? `Room: ${roomType}` : ""}

A photo of the item is also provided. Use both the spoken description and the photo to:
- Identify the item precisely (brand, model if visible)
- Assess condition from visual evidence
- Note any visible accessories, damage, or configuration details

Return a JSON object:
{
  "itemName": "concise item name (e.g. 'Sony A7R III Camera Body')",
  "category": "one of: Furniture, Electronics, Appliance, Keepsake, Media, Linens, Decor, Tools, Sports, Clothing, Other",
  "condition": "one of: NEW, LIKE_NEW, GOOD, FAIR, POOR",
  "sizeClass": "one of: SMALL, MEDIUM, LARGE, OVERSIZED",
  "notes": "any extra details from transcript or photo not captured above (accessories, bundles, visible damage, configuration details, etc.)",
  "intent": "keep" or "sell" or "ship" or "donate" or null (null if user expressed no clear intent),
  "sentimental": true or false (true if user expressed sentimental attachment, family heirloom, irreplaceable, etc.)
}

Rules:
- Prioritize visual evidence from the photo when it conflicts with or supplements the transcript
- Extract the most specific item name possible — include brand and model when visible in the photo or spoken
- Let the photo inform condition: visible scratches, wear marks, or damage should lower condition from GOOD
- Size: SMALL (fits in a box), MEDIUM (chair-sized), LARGE (couch/desk), OVERSIZED (piano/treadmill)
- Notes should capture accessory/bundle info visible in the photo: "with lens", "includes case", "body only", etc.
- intent: use "keep" if user said they want to keep it, "sell" if they want to sell it, "ship" if they want to ship it, "donate" if they want to donate it, null otherwise
- Return ONLY the JSON object`;
}

function guessCategoryFromRoom(roomType?: string): string {
  if (!roomType) return "Other";
  const rt = roomType.toLowerCase();
  if (rt.includes("kitchen")) return "Appliance";
  if (rt.includes("bedroom") || rt.includes("linen")) return "Linens";
  if (rt.includes("garage") || rt.includes("workshop")) return "Tools";
  if (rt.includes("office")) return "Electronics";
  if (rt.includes("living") || rt.includes("family")) return "Furniture";
  if (rt.includes("kids") || rt.includes("play")) return "Other";
  return "Other";
}

async function tryClaudeParse(prompt: string): Promise<ParsedVoiceItem | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return parseJSON(text);
  } catch {
    return null;
  }
}

async function tryClaudeParseWithPhoto(
  prompt: string,
  photoFilename: string,
): Promise<ParsedVoiceItem | null> {
  try {
    const filePath = path.join(UPLOADS_DIR, photoFilename);
    if (!fs.existsSync(filePath)) return null;

    const imageData = fs.readFileSync(filePath);
    const base64 = imageData.toString("base64");
    const ext = path.extname(photoFilename).toLowerCase();
    const mediaType: "image/jpeg" | "image/png" | "image/webp" =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return parseJSON(text);
  } catch {
    return null;
  }
}

async function tryOpenAIParse(prompt: string): Promise<ParsedVoiceItem | null> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.choices[0]?.message?.content ?? "";
    return parseJSON(text);
  } catch {
    return null;
  }
}

async function tryOpenAIParseWithPhoto(
  prompt: string,
  photoFilename: string,
): Promise<ParsedVoiceItem | null> {
  try {
    const filePath = path.join(UPLOADS_DIR, photoFilename);
    if (!fs.existsSync(filePath)) return null;

    const imageData = fs.readFileSync(filePath);
    const base64 = imageData.toString("base64");
    const ext = path.extname(photoFilename).toLowerCase();
    const mimeType =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "low",
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    return parseJSON(text);
  } catch {
    return null;
  }
}

function parseJSON(text: string): ParsedVoiceItem | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    // Validate required fields
    if (!raw.itemName || typeof raw.itemName !== "string") return null;
    // Normalize enums
    const validConditions = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"];
    const condition = validConditions.includes(raw.condition as string) ? (raw.condition as string) : "GOOD";
    const validSizes = ["SMALL", "MEDIUM", "LARGE", "OVERSIZED"];
    const sizeClass = validSizes.includes(raw.sizeClass as string) ? (raw.sizeClass as string) : "MEDIUM";
    const validCategories = ["Furniture", "Electronics", "Appliance", "Keepsake", "Media", "Linens", "Decor", "Tools", "Sports", "Clothing", "Other"];
    const category = validCategories.includes(raw.category as string) ? (raw.category as string) : "Other";
    const validIntents = ["keep", "sell", "ship", "donate"];
    const rawIntent = raw.intent;
    const intent = typeof rawIntent === "string" && validIntents.includes(rawIntent)
      ? (rawIntent as "keep" | "sell" | "ship" | "donate")
      : undefined;
    return {
      itemName: raw.itemName as string,
      category,
      condition,
      sizeClass,
      notes: typeof raw.notes === "string" ? raw.notes : "",
      intent,
      sentimental: !!(raw.sentimental),
    };
  } catch {
    return null;
  }
}
