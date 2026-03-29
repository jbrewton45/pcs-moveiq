import type { ModelNormalization } from "../types/domain.js";

interface KnownModelEntry {
  canonicalName: string;
  brand: string;
  model: string;
  category: string;
  patterns: RegExp[];
  minReasonablePrice: number;
  maxReasonablePrice: number;
}

const KNOWN_MODELS: KnownModelEntry[] = [
  // ---- Sony Cameras ----
  {
    canonicalName: "Sony A7R III",
    brand: "Sony",
    model: "A7R III",
    category: "Electronics",
    patterns: [/a7r\s*iii/i, /a7r\s*3\b/i, /ilce-?7rm3/i, /alpha\s*7r\s*iii/i, /alpha\s*7r\s*3\b/i],
    minReasonablePrice: 800,
    maxReasonablePrice: 2200,
  },
  {
    canonicalName: "Sony A7 III",
    brand: "Sony",
    model: "A7 III",
    category: "Electronics",
    patterns: [/\ba7\s*iii\b/i, /\ba7\s*3\b/i, /ilce-?7m3/i, /alpha\s*7\s*iii\b/i, /alpha\s*7\s*3\b/i],
    minReasonablePrice: 600,
    maxReasonablePrice: 1500,
  },
  {
    canonicalName: "Sony A7R IV",
    brand: "Sony",
    model: "A7R IV",
    category: "Electronics",
    patterns: [/a7r\s*iv/i, /a7r\s*4\b/i, /ilce-?7rm4/i, /alpha\s*7r\s*iv/i],
    minReasonablePrice: 1200,
    maxReasonablePrice: 2800,
  },
  {
    canonicalName: "Sony A6400",
    brand: "Sony",
    model: "A6400",
    category: "Electronics",
    patterns: [/a6400/i, /ilce-?6400/i, /alpha\s*6400/i],
    minReasonablePrice: 300,
    maxReasonablePrice: 800,
  },

  // ---- Canon Cameras ----
  {
    canonicalName: "Canon EOS R5",
    brand: "Canon",
    model: "EOS R5",
    category: "Electronics",
    patterns: [/eos\s*r5\b/i, /\bcannon?\s*r5\b/i, /canon\s*r5\b/i],
    minReasonablePrice: 1500,
    maxReasonablePrice: 3200,
  },
  {
    canonicalName: "Canon EOS R6",
    brand: "Canon",
    model: "EOS R6",
    category: "Electronics",
    patterns: [/eos\s*r6\b/i, /\bcannon?\s*r6\b/i, /canon\s*r6\b/i],
    minReasonablePrice: 800,
    maxReasonablePrice: 1800,
  },
  {
    canonicalName: "Canon EOS 5D Mark IV",
    brand: "Canon",
    model: "EOS 5D Mark IV",
    category: "Electronics",
    patterns: [/5d\s*mark\s*iv/i, /5d\s*mk\s*iv/i, /5d\s*iv\b/i],
    minReasonablePrice: 700,
    maxReasonablePrice: 1600,
  },

  // ---- Nikon Cameras ----
  {
    canonicalName: "Nikon Z6 II",
    brand: "Nikon",
    model: "Z6 II",
    category: "Electronics",
    patterns: [/z6\s*ii\b/i, /z6\s*2\b/i, /nikon\s*z6ii/i],
    minReasonablePrice: 600,
    maxReasonablePrice: 1500,
  },
  {
    canonicalName: "Nikon Z7 II",
    brand: "Nikon",
    model: "Z7 II",
    category: "Electronics",
    patterns: [/z7\s*ii\b/i, /z7\s*2\b/i, /nikon\s*z7ii/i],
    minReasonablePrice: 1000,
    maxReasonablePrice: 2200,
  },
  {
    canonicalName: "Nikon D750",
    brand: "Nikon",
    model: "D750",
    category: "Electronics",
    patterns: [/\bd750\b/i, /nikon\s*d750/i],
    minReasonablePrice: 400,
    maxReasonablePrice: 1000,
  },

  // ---- Kitchen Appliances ----
  {
    canonicalName: "KitchenAid Stand Mixer",
    brand: "KitchenAid",
    model: "Stand Mixer",
    category: "Appliance",
    patterns: [/kitchenaid\s*stand\s*mixer/i, /kitchenaid\s*mixer/i, /kitchen\s*aid\s*mixer/i],
    minReasonablePrice: 150,
    maxReasonablePrice: 400,
  },
  {
    canonicalName: "Vitamix Blender",
    brand: "Vitamix",
    model: "Blender",
    category: "Appliance",
    patterns: [/vitamix/i],
    minReasonablePrice: 100,
    maxReasonablePrice: 500,
  },
  {
    canonicalName: "Instant Pot Duo",
    brand: "Instant Pot",
    model: "Duo",
    category: "Appliance",
    patterns: [/instant\s*pot/i],
    minReasonablePrice: 40,
    maxReasonablePrice: 150,
  },

  // ---- Exercise Equipment ----
  {
    canonicalName: "Peloton Bike",
    brand: "Peloton",
    model: "Bike",
    category: "Furniture",
    patterns: [/peloton\s*bike\+?/i, /peloton\s*cycle/i, /\bpeloton\b/i],
    minReasonablePrice: 400,
    maxReasonablePrice: 1200,
  },

  // ---- Vacuums ----
  {
    canonicalName: "Dyson V15 Detect",
    brand: "Dyson",
    model: "V15",
    category: "Appliance",
    patterns: [/dyson\s*v15/i],
    minReasonablePrice: 200,
    maxReasonablePrice: 500,
  },
  {
    canonicalName: "Dyson V12 Detect Slim",
    brand: "Dyson",
    model: "V12",
    category: "Appliance",
    patterns: [/dyson\s*v12/i],
    minReasonablePrice: 150,
    maxReasonablePrice: 400,
  },
  {
    canonicalName: "Dyson V11",
    brand: "Dyson",
    model: "V11",
    category: "Appliance",
    patterns: [/dyson\s*v11/i],
    minReasonablePrice: 150,
    maxReasonablePrice: 380,
  },
  {
    canonicalName: "Dyson V10",
    brand: "Dyson",
    model: "V10",
    category: "Appliance",
    patterns: [/dyson\s*v10/i],
    minReasonablePrice: 100,
    maxReasonablePrice: 300,
  },

  // ---- Grills ----
  {
    canonicalName: "Weber Genesis Grill",
    brand: "Weber",
    model: "Genesis",
    category: "Appliance",
    patterns: [/weber\s*genesis/i],
    minReasonablePrice: 200,
    maxReasonablePrice: 800,
  },
  {
    canonicalName: "Weber Spirit Grill",
    brand: "Weber",
    model: "Spirit",
    category: "Appliance",
    patterns: [/weber\s*spirit/i],
    minReasonablePrice: 100,
    maxReasonablePrice: 400,
  },

  // ---- Musical Instruments ----
  {
    canonicalName: "Fender Stratocaster",
    brand: "Fender",
    model: "Stratocaster",
    category: "Electronics",
    patterns: [/fender\s*strat(ocaster)?/i, /stratocaster/i],
    minReasonablePrice: 300,
    maxReasonablePrice: 1500,
  },
  {
    canonicalName: "Fender Telecaster",
    brand: "Fender",
    model: "Telecaster",
    category: "Electronics",
    patterns: [/fender\s*tele(caster)?/i, /telecaster/i],
    minReasonablePrice: 300,
    maxReasonablePrice: 1400,
  },
  {
    canonicalName: "Gibson Les Paul",
    brand: "Gibson",
    model: "Les Paul",
    category: "Electronics",
    patterns: [/gibson\s*les\s*paul/i, /les\s*paul/i],
    minReasonablePrice: 500,
    maxReasonablePrice: 3000,
  },
  {
    canonicalName: "Gibson SG",
    brand: "Gibson",
    model: "SG",
    category: "Electronics",
    patterns: [/gibson\s*sg\b/i],
    minReasonablePrice: 400,
    maxReasonablePrice: 2000,
  },

  // ---- Gaming Consoles ----
  {
    canonicalName: "PlayStation 5",
    brand: "Sony",
    model: "PlayStation 5",
    category: "Electronics",
    patterns: [/\bps5\b/i, /playstation\s*5\b/i, /play\s*station\s*5\b/i],
    minReasonablePrice: 250,
    maxReasonablePrice: 500,
  },
  {
    canonicalName: "Xbox Series X",
    brand: "Microsoft",
    model: "Xbox Series X",
    category: "Electronics",
    patterns: [/xbox\s*series\s*x\b/i],
    minReasonablePrice: 200,
    maxReasonablePrice: 450,
  },
  {
    canonicalName: "Xbox Series S",
    brand: "Microsoft",
    model: "Xbox Series S",
    category: "Electronics",
    patterns: [/xbox\s*series\s*s\b/i],
    minReasonablePrice: 150,
    maxReasonablePrice: 280,
  },
  {
    canonicalName: "Nintendo Switch OLED",
    brand: "Nintendo",
    model: "Switch OLED",
    category: "Electronics",
    patterns: [/nintendo\s*switch\s*oled/i, /switch\s*oled/i],
    minReasonablePrice: 150,
    maxReasonablePrice: 300,
  },
  {
    canonicalName: "Nintendo Switch",
    brand: "Nintendo",
    model: "Switch",
    category: "Electronics",
    // More specific OLED pattern above takes priority
    patterns: [/nintendo\s*switch\b/i, /\bswitch\s*v\d/i],
    minReasonablePrice: 100,
    maxReasonablePrice: 250,
  },

  // ---- Smart Displays / Speakers ----
  {
    canonicalName: "Apple iPad Pro",
    brand: "Apple",
    model: "iPad Pro",
    category: "Electronics",
    patterns: [/ipad\s*pro/i, /apple\s*ipad\s*pro/i],
    minReasonablePrice: 300,
    maxReasonablePrice: 1000,
  },
  {
    canonicalName: "Apple MacBook Pro",
    brand: "Apple",
    model: "MacBook Pro",
    category: "Electronics",
    patterns: [/macbook\s*pro/i],
    minReasonablePrice: 500,
    maxReasonablePrice: 2500,
  },
  {
    canonicalName: "Apple MacBook Air",
    brand: "Apple",
    model: "MacBook Air",
    category: "Electronics",
    patterns: [/macbook\s*air/i],
    minReasonablePrice: 300,
    maxReasonablePrice: 1400,
  },
];

/**
 * Normalize input text for matching: lowercase, collapse whitespace,
 * remove common noise words (used, selling, for sale, etc.)
 */
function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\b(used|like new|good|fair|poor|for sale|selling|item|the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a combined search string from all available fields.
 * Checking brand+model combo and itemName gives better coverage.
 */
function buildSearchString(
  itemName: string,
  brand?: string,
  model?: string,
  category?: string,
): string {
  const parts = [itemName, brand, model, category].filter(Boolean);
  return normalizeText(parts.join(" "));
}

/**
 * Attempt to match an item against the known model registry.
 * Returns a ModelNormalization if a match is found, null otherwise.
 */
export function normalizeModel(
  itemName: string,
  brand?: string,
  model?: string,
  category?: string,
): ModelNormalization | null {
  const searchStr = buildSearchString(itemName, brand, model, category);

  for (const entry of KNOWN_MODELS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(searchStr)) {
        return {
          canonicalName: entry.canonicalName,
          brand: entry.brand,
          model: entry.model,
          category: entry.category,
          isSpecialty: true,
          minReasonablePrice: entry.minReasonablePrice,
          maxReasonablePrice: entry.maxReasonablePrice,
        };
      }
    }
  }

  return null;
}

/**
 * Clamp a price to the known reasonable range for a normalized model.
 * If the AI returns a wildly out-of-range value, we pull it back to the boundary.
 */
export function applyPriceGuardrails(price: number, normalization: ModelNormalization): number {
  if (price < normalization.minReasonablePrice) return normalization.minReasonablePrice;
  if (price > normalization.maxReasonablePrice) return normalization.maxReasonablePrice;
  return price;
}
