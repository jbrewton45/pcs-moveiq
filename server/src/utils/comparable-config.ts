import type { ComparableCandidate } from "../types/providers.js";

export type ConfigTier = "base" | "base_plus" | "bundle" | "full_kit";

export interface ClassifiedComparable extends ComparableCandidate {
  configTier: ConfigTier;
  configScore: number; // 0 = exact base, 1 = full kit
}

export interface ConfigGroupResult {
  userTier: ConfigTier;
  bestCluster: ClassifiedComparable[];
  allClassified: ClassifiedComparable[];
  adjustmentNote?: string;
}

// Universal accessory/bundle keywords by category patterns
const BUNDLE_INDICATORS: RegExp[] = [
  /\bbundle\b/i, /\bkit\b/i, /\bpackage\b/i, /\bset\b/i,
  /\bcombo\b/i, /\blot\b/i, /\bcollection\b/i, /\bsetup\b/i,
  /\bfull setup\b/i, /\bcomplete\b/i, /\beverything\b/i,
];

const ACCESSORY_INDICATORS: RegExp[] = [
  /\bwith\s+(case|bag|lens|charger|battery|stand|mount|cable|remote|cover|strap|extra|accessories)/i,
  /\binclude[sd]?\b/i,
  /\bplus\b/i,
  /\b\d+\s*(pieces?|pcs|items)\b/i,
  /\band\s+(case|bag|lens|charger|battery|stand|mount)/i,
];

// Category-specific high-value accessory patterns
const HIGH_VALUE_ACCESSORIES: Record<string, RegExp[]> = {
  camera: [
    /\bwith\s+\d+mm/i, /\blens\b/i, /\bflash\b/i, /\bgimbal\b/i,
    /\btripod\b/i, /\brig\b/i, /\bcage\b/i, /\bmonitor\b/i,
  ],
  printer_3d: [
    /\bams\b/i, /\benclosure\b/i, /\bmulti.?color/i,
    /\bfilament\b/i, /\bprint\s*plate/i, /\bnozzle\s*kit/i,
  ],
  laser: [
    /\brotary\b/i, /\bair\s*assist/i, /\bhoneycomb\b/i,
    /\bexhaust\b/i, /\briser\b/i, /\benclosure\b/i,
  ],
  drone: [
    /\bfly\s*more\b/i, /\bextra\s*batter/i, /\bnd\s*filter/i,
    /\bcontroller\b/i, /\bgoggles\b/i, /\bpropeller/i,
  ],
  console: [
    /\bextra\s*controller/i, /\bgames?\b/i, /\bheadset\b/i,
    /\bcharging\s*station/i, /\bstand\b/i,
  ],
  laptop: [
    /\bdock\b/i, /\bmonitor\b/i, /\bkeyboard\b/i, /\bmouse\b/i,
    /\bcharger\b/i, /\bcase\b/i, /\bstand\b/i,
  ],
  tools: [
    /\bbit\s*set/i, /\bblade/i, /\bcase\b/i, /\bcharger\b/i,
    /\bbatter(y|ies)\b/i, /\baccessor/i,
  ],
  speaker: [
    /\bsub\s*woofer/i, /\breceiver\b/i, /\bstand/i,
    /\bsurround/i, /\bpair\b/i, /\bset\s*of/i,
  ],
  instrument: [
    /\bamp\b/i, /\bamplifier\b/i, /\bcase\b/i, /\bstand\b/i,
    /\bpedal/i, /\bstrings\b/i, /\bbow\b/i, /\bpick/i,
  ],
  network: [
    /\bswitch\b/i, /\brack\b/i, /\bcable/i, /\bups\b/i,
    /\bpatch\s*panel/i, /\bmount/i,
  ],
};

/**
 * Detect which high-value accessory category applies based on item context.
 */
function detectAccessoryCategory(itemName: string, category?: string): string | null {
  const text = `${itemName} ${category ?? ""}`.toLowerCase();
  if (/camera|mirrorless|dslr|a7|canon\s*r|nikon\s*z|sony\s*a\d/i.test(text)) return "camera";
  if (/3d\s*print|bambu|prusa|ender|creality/i.test(text)) return "printer_3d";
  if (/laser|engrav|glowforge|xtool|ortur/i.test(text)) return "laser";
  if (/drone|dji|mavic|phantom|fpv/i.test(text)) return "drone";
  if (/playstation|xbox|nintendo|switch|ps[45]/i.test(text)) return "console";
  if (/laptop|macbook|thinkpad|dell\s*xps|surface/i.test(text)) return "laptop";
  if (/drill|saw|impact|wrench|tool/i.test(text)) return "tools";
  if (/speaker|soundbar|subwoofer|audio|bose|sonos/i.test(text)) return "speaker";
  if (/guitar|bass|keyboard|violin|drum|amp/i.test(text)) return "instrument";
  if (/router|switch|server|nas|ubiquiti|unifi|synology/i.test(text)) return "network";
  return null;
}

/**
 * Classify a single comparable listing into a configuration tier.
 */
export function classifyComparable(
  comp: ComparableCandidate,
  itemName: string,
  category?: string,
): ClassifiedComparable {
  const title = comp.title.toLowerCase();
  let score = 0;

  // Check bundle indicators (+0.5 each, max contribution 1.0)
  let bundleHits = 0;
  for (const pattern of BUNDLE_INDICATORS) {
    if (pattern.test(title)) bundleHits++;
  }
  score += Math.min(bundleHits * 0.5, 1.0);

  // Check general accessory indicators (+0.2 each)
  for (const pattern of ACCESSORY_INDICATORS) {
    if (pattern.test(title)) score += 0.2;
  }

  // Check category-specific high-value accessories (+0.3 each)
  const accCategory = detectAccessoryCategory(itemName, category);
  if (accCategory && HIGH_VALUE_ACCESSORIES[accCategory]) {
    for (const pattern of HIGH_VALUE_ACCESSORIES[accCategory]) {
      if (pattern.test(title)) score += 0.3;
    }
  }

  // Check for "body only", "unit only", "console only" etc. (strong base signal)
  if (/\bonly\b/i.test(title) && /\b(body|unit|console|base|bare|device|printer|machine)\b/i.test(title)) {
    score = Math.max(score - 0.5, 0);
  }

  // Clamp to 0-1
  score = Math.min(Math.max(score, 0), 1);

  // Assign tier
  let configTier: ConfigTier;
  if (score < 0.15) configTier = "base";
  else if (score < 0.4) configTier = "base_plus";
  else if (score < 0.7) configTier = "bundle";
  else configTier = "full_kit";

  return { ...comp, configTier, configScore: Math.round(score * 100) / 100 };
}

/**
 * Classify the user's item description into a config tier.
 */
export function classifyUserItem(
  itemName: string,
  notes?: string,
  category?: string,
): ConfigTier {
  const text = `${itemName} ${notes ?? ""}`.toLowerCase();
  let score = 0;

  for (const pattern of BUNDLE_INDICATORS) {
    if (pattern.test(text)) score += 0.5;
  }
  for (const pattern of ACCESSORY_INDICATORS) {
    if (pattern.test(text)) score += 0.2;
  }
  const accCategory = detectAccessoryCategory(itemName, category);
  if (accCategory && HIGH_VALUE_ACCESSORIES[accCategory]) {
    for (const pattern of HIGH_VALUE_ACCESSORIES[accCategory]) {
      if (pattern.test(text)) score += 0.3;
    }
  }
  if (/\bonly\b/i.test(text) && /\b(body|unit|console|base|bare|device|printer|machine)\b/i.test(text)) {
    score = Math.max(score - 0.5, 0);
  }

  score = Math.min(Math.max(score, 0), 1);
  if (score < 0.15) return "base";
  if (score < 0.4) return "base_plus";
  if (score < 0.7) return "bundle";
  return "full_kit";
}

/**
 * Group comparables by configuration match to the user's item,
 * returning the best cluster for pricing.
 */
export function groupComparablesByConfig(
  comparables: ComparableCandidate[],
  itemName: string,
  notes?: string,
  category?: string,
): ConfigGroupResult {
  if (comparables.length === 0) {
    return { userTier: "base", bestCluster: [], allClassified: [] };
  }

  const userTier = classifyUserItem(itemName, notes, category);
  const classified = comparables.map(c => classifyComparable(c, itemName, category));

  // Group by tier
  const tiers: Record<ConfigTier, ClassifiedComparable[]> = {
    base: [], base_plus: [], bundle: [], full_kit: [],
  };
  for (const c of classified) {
    tiers[c.configTier].push(c);
  }

  // Pick the best cluster: prefer exact match, then adjacent tiers
  const tierOrder: ConfigTier[] = ["base", "base_plus", "bundle", "full_kit"];
  const userIndex = tierOrder.indexOf(userTier);

  // Try exact match first
  if (tiers[userTier].length >= 2) {
    return { userTier, bestCluster: tiers[userTier], allClassified: classified };
  }

  // Try adjacent tiers (prefer lower config for conservative pricing)
  for (let offset = 1; offset <= 3; offset++) {
    const lowerIdx = userIndex - offset;
    const higherIdx = userIndex + offset;

    if (lowerIdx >= 0 && tiers[tierOrder[lowerIdx]].length >= 2) {
      const tier = tierOrder[lowerIdx];
      return {
        userTier,
        bestCluster: tiers[tier],
        allClassified: classified,
        adjustmentNote: `Priced from ${tier.replace("_", " ")} listings (closest match to your ${userTier.replace("_", " ")} configuration)`,
      };
    }
    if (higherIdx < tierOrder.length && tiers[tierOrder[higherIdx]].length >= 2) {
      const tier = tierOrder[higherIdx];
      return {
        userTier,
        bestCluster: tiers[tier],
        allClassified: classified,
        adjustmentNote: `Priced from ${tier.replace("_", " ")} listings — your ${userTier.replace("_", " ")} item may be worth less`,
      };
    }
  }

  // Not enough in any single tier — use all
  return {
    userTier,
    bestCluster: classified,
    allClassified: classified,
    adjustmentNote: "Limited comparable data — prices based on mixed configurations",
  };
}
