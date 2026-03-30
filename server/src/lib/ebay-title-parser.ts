export interface ParsedTitle {
  original: string;
  normalized: string;
  tokens: string[];
  flags: TitleFlags;
}

export interface TitleFlags {
  isBundleLikely: boolean;
  isAccessoryOnly: boolean;
  isPartsRepair: boolean;
  isBaseUnit: boolean;
  hasLens: boolean;           // camera-specific but universal check
  hasAccessoryMention: boolean;
  hasConditionNote: boolean;
  hasMultipleItems: boolean;
  noise: string[];            // tokens classified as noise
}

// Patterns that indicate the listing is an accessory, not the main item
const ACCESSORY_ONLY_PATTERNS: RegExp[] = [
  /\b(case|cover|skin|screen protector|charger|cable|strap|mount|bracket|holder|adapter|battery)\s+(for|fits|compatible)\b/i,
  /\bfor\s+(sony|canon|nikon|dji|bambu|creality|dewalt|makita|kitchenaid|dyson)\b/i,
  /\breplacement\s+(battery|charger|cable|strap|part|screen|filter|blade|brush)\b/i,
  /\bcompatible\s+with\b/i,
  /\bfits\s+\w+\b/i,
  /\b(tempered glass|screen film|lens cap|body cap|hot shoe|grip)\b/i,
];

// Patterns indicating parts or repair items
const PARTS_REPAIR_PATTERNS: RegExp[] = [
  /\b(for parts|parts only|not working|broken|as[- ]is|defective|faulty|damaged|for repair)\b/i,
  /\b(read desc|needs repair|doesn.t work|won.t turn on|dead|cracked)\b/i,
  /\b(salvage|junk|parts\/repair)\b/i,
];

// Bundle indicators
const BUNDLE_PATTERNS: RegExp[] = [
  /\bbundle\b/i, /\bkit\b/i, /\blot\s+of\b/i, /\bset\s+of\b/i,
  /\bcollection\b/i, /\bcombo\b/i, /\bpackage\s+deal\b/i,
  /\b\d+\s*(piece|pc|item)s?\b/i, /\beverything\s+(included|you need)\b/i,
  /\bfull\s+(setup|system|kit|set)\b/i, /\bcomplete\s+(system|setup|set|kit)\b/i,
];

// Base-unit indicators (item sold alone)
const BASE_UNIT_PATTERNS: RegExp[] = [
  /\b(body|unit|console|machine|base|printer|device|tool)\s+only\b/i,
  /\bbare\s+(tool|unit|body|bones)\b/i,
  /\bjust\s+the\s+(camera|body|console|printer|machine)\b/i,
  /\bno\s+(lens|accessories|battery|charger|extras)\b/i,
];

// Accessory mentions (item includes extras but isn't accessory-only)
const ACCESSORY_MENTION_PATTERNS: RegExp[] = [
  /\bwith\s+(lens|case|bag|charger|battery|tripod|stand|mount|cable|extra|dock|keyboard|mouse|controller|game)/i,
  /\binclude[sd]?\s+/i,
  /\bplus\s+(lens|case|charger|battery|extra)/i,
  /\b\+\s*(lens|case|charger|battery|mount|stand)/i,
  /\b(2|3|4|5)x?\s+(batteries|lenses|controllers|games)\b/i,
];

// Condition keywords in title
const CONDITION_NOTE_PATTERNS: RegExp[] = [
  /\b(mint|excellent|pristine|like new|great condition|good condition|fair condition)\b/i,
  /\b(used|pre-?owned|refurbished|renewed|open box|sealed|brand new|nib|nwt)\b/i,
  /\b(minor\s+(wear|scratch|scuff)|cosmetic|light\s+use)\b/i,
];

// Noise words to strip for matching
const NOISE_TOKENS = new Set([
  "free", "shipping", "fast", "ship", "ships", "obo", "or", "best", "offer",
  "look", "great", "deal", "wow", "rare", "htf", "hard", "find", "l@@k",
  "!!", "!!!", "***", "---", "+++", "read", "description", "see", "pics",
  "photos", "authentic", "genuine", "original", "oem", "official",
]);

export function parseTitle(title: string): ParsedTitle {
  const original = title;
  const normalized = title
    .toLowerCase()
    .replace(/[^\w\s\-\/\+\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
  const noise = tokens.filter(t => NOISE_TOKENS.has(t));

  const flags: TitleFlags = {
    isBundleLikely: BUNDLE_PATTERNS.some(p => p.test(title)),
    isAccessoryOnly: ACCESSORY_ONLY_PATTERNS.some(p => p.test(title)),
    isPartsRepair: PARTS_REPAIR_PATTERNS.some(p => p.test(title)),
    isBaseUnit: BASE_UNIT_PATTERNS.some(p => p.test(title)),
    hasLens: /\b(lens|lenses|\d+mm|\d+-\d+mm)\b/i.test(title),
    hasAccessoryMention: ACCESSORY_MENTION_PATTERNS.some(p => p.test(title)),
    hasConditionNote: CONDITION_NOTE_PATTERNS.some(p => p.test(title)),
    hasMultipleItems: /\b(lot|bundle|set)\s+of\s+\d+\b/i.test(title) || /\b\d+\s*(piece|pc|item)s?\b/i.test(title),
    noise,
  };

  return { original, normalized, tokens, flags };
}

/**
 * Normalize a search query for consistent matching.
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s\-\/\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a title contains the core query tokens (order-independent).
 */
export function titleMatchesQuery(parsedTitle: ParsedTitle, normalizedQuery: string): boolean {
  const queryTokens = normalizedQuery.split(/\s+/).filter(t => t.length > 1 && !NOISE_TOKENS.has(t));
  if (queryTokens.length === 0) return true;

  // Require at least 60% of query tokens to appear in the title
  const matched = queryTokens.filter(qt =>
    parsedTitle.normalized.includes(qt)
  );
  return matched.length / queryTokens.length >= 0.6;
}
