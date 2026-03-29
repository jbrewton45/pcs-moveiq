import type { ComparableSource, ClarificationQuestion } from "./domain.js";

export interface ComparableCandidate {
  title: string;
  source: ComparableSource;
  url?: string;
  thumbnailUrl?: string;
  price: number;
  soldStatus?: string;
}

export interface ComparableLookupInput {
  itemName: string;
  category: string;
  condition: string;
  brand?: string;
  model?: string;
}

export interface PricingOutput {
  fastSale: number;
  fairMarket: number;
  reach: number;
  confidence: number;
  reasoning: string;
  suggestedChannel: string;
  saleSpeedBand: "FAST" | "MODERATE" | "SLOW";
  comparables: ComparableCandidate[];
}

export interface IdentificationOutput {
  identifiedName: string;
  identifiedCategory: string;
  identifiedBrand?: string;
  identifiedModel?: string;
  confidence: number;
  reasoning: string;
  isSpecialty?: boolean;
  clarifications?: ClarificationQuestion[];
}
