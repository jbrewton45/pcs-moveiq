export type IdentificationQuality = "STRONG" | "MEDIUM" | "WEAK";

export const GENERIC_NAMES: readonly string[] = [
  "scanned item", "item", "unknown item", "uncategorized",
  "unknown", "object", "untitled", "new item", "misc",
  "miscellaneous", "household item", "generic item",
];

export const GENERIC_CATEGORIES: readonly string[] = [
  "uncategorized", "other", "misc", "miscellaneous", "unknown",
];

export const CONFIDENCE_STRONG = 0.75;
export const CONFIDENCE_MEDIUM = 0.5;

export function isGenericName(name: string | null | undefined): boolean {
  if (name == null) return true;
  return GENERIC_NAMES.includes(name.trim().toLowerCase());
}

export function isGenericCategory(cat: string | null | undefined): boolean {
  if (cat == null) return true;
  return GENERIC_CATEGORIES.includes(cat.trim().toLowerCase());
}

export function computeIdentificationQuality(input: {
  identifiedName: string;
  identifiedCategory: string;
  identifiedBrand?: string | null;
  identifiedModel?: string | null;
  confidence: number;
  provider: "claude" | "openai" | "mock";
}): IdentificationQuality {
  const { identifiedName, identifiedCategory, identifiedBrand, identifiedModel, confidence, provider } = input;

  // A placeholder name is unusable regardless of confidence.
  if (isGenericName(identifiedName)) return "WEAK";

  // Mock provider never produces a real identification.
  if (provider === "mock") return "WEAK";

  // Below minimum confidence threshold.
  if (confidence < CONFIDENCE_MEDIUM) return "WEAK";

  // STRONG: high confidence with sufficient corroborating signal.
  const hasNonGenericCategory = !isGenericCategory(identifiedCategory);
  const hasBrandOrModel = !!(identifiedBrand?.trim() || identifiedModel?.trim());

  if (
    confidence >= CONFIDENCE_STRONG &&
    (hasBrandOrModel || hasNonGenericCategory)
  ) {
    return "STRONG";
  }

  // Everything else that passed the WEAK gates falls to MEDIUM.
  return "MEDIUM";
}

export function isPricingEligible(quality: IdentificationQuality): boolean {
  return quality !== "WEAK";
}
