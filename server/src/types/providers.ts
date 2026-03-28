import type { ComparableSource } from "./domain.js";

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
