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
  willingToSell: boolean;
  keepFlag: boolean;
  sentimentalFlag: boolean;
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
    willingToSell: true,
    keepFlag: false,
    sentimentalFlag: false,
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
  const prompt = buildParsePromptWithPhoto(transcript, roomType);

  // Try vision-capable models: Claude first, then OpenAI
  if (isClaudeAvailable()) {
    const result = await tryClaudeParseWithPhoto(prompt, photoFilename);
    if (result) return result;
  }
  if (isOpenAIAvailable()) {
    const result = await tryOpenAIParseWithPhoto(prompt, photoFilename);
    if (result) return result;
  }

  // Fallback to text-only parse
  return parseVoiceTranscript(transcript, roomType);
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
  "willingToSell": true or false (infer from context — if they mention selling, listing, getting rid of, or price → true; if they say keep, sentimental, irreplaceable → false; default true),
  "keepFlag": true or false (only if they explicitly say they want to keep it),
  "sentimentalFlag": true or false (only if they mention sentimental value, family heirloom, etc.)
}

Rules:
- Extract the most specific item name possible from the transcript
- Include brand and model in itemName when mentioned
- Condition defaults to GOOD unless they mention damage, wear, new, etc.
- Size: SMALL (fits in a box), MEDIUM (chair-sized), LARGE (couch/desk), OVERSIZED (piano/treadmill)
- Notes should capture accessory/bundle info: "with lens", "includes case", "body only", etc.
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
  "willingToSell": true or false (infer from context — if they mention selling, listing, getting rid of, or price → true; if they say keep, sentimental, irreplaceable → false; default true),
  "keepFlag": true or false (only if they explicitly say they want to keep it),
  "sentimentalFlag": true or false (only if they mention sentimental value, family heirloom, etc.)
}

Rules:
- Prioritize visual evidence from the photo when it conflicts with or supplements the transcript
- Extract the most specific item name possible — include brand and model when visible in the photo or spoken
- Let the photo inform condition: visible scratches, wear marks, or damage should lower condition from GOOD
- Size: SMALL (fits in a box), MEDIUM (chair-sized), LARGE (couch/desk), OVERSIZED (piano/treadmill)
- Notes should capture accessory/bundle info visible in the photo: "with lens", "includes case", "body only", etc.
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
    const parsed = JSON.parse(match[0]) as ParsedVoiceItem;
    // Validate required fields
    if (!parsed.itemName || typeof parsed.itemName !== "string") return null;
    // Normalize enums
    const validConditions = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"];
    if (!validConditions.includes(parsed.condition)) parsed.condition = "GOOD";
    const validSizes = ["SMALL", "MEDIUM", "LARGE", "OVERSIZED"];
    if (!validSizes.includes(parsed.sizeClass)) parsed.sizeClass = "MEDIUM";
    const validCategories = ["Furniture", "Electronics", "Appliance", "Keepsake", "Media", "Linens", "Decor", "Tools", "Sports", "Clothing", "Other"];
    if (!validCategories.includes(parsed.category)) parsed.category = "Other";
    parsed.willingToSell = !!parsed.willingToSell;
    parsed.keepFlag = !!parsed.keepFlag;
    parsed.sentimentalFlag = !!parsed.sentimentalFlag;
    return parsed;
  } catch {
    return null;
  }
}
