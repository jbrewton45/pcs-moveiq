/**
 * Marketplace configuration for channel-aware links and display.
 * Currently eBay is the only live source. Facebook Marketplace and OfferUp
 * are structured here for future integration — no scraping, just hooks.
 */

export type ListingSource = "ebay" | "facebook" | "offerup" | "local" | "donate";

export interface MarketplaceConfig {
  displayName: string;
  searchUrlTemplate: string | null; // null = no web link available
  badgeClass: string;
}

export const MARKETPLACE_CONFIG: Record<ListingSource, MarketplaceConfig> = {
  ebay: {
    displayName: "eBay",
    searchUrlTemplate: "https://www.ebay.com/sch/i.html?_nkw={query}",
    badgeClass: "mp-badge--ebay",
  },
  facebook: {
    displayName: "Facebook Marketplace",
    searchUrlTemplate: "https://www.facebook.com/marketplace/search/?query={query}",
    badgeClass: "mp-badge--facebook",
  },
  offerup: {
    displayName: "OfferUp",
    searchUrlTemplate: "https://offerup.com/search/?q={query}",
    badgeClass: "mp-badge--offerup",
  },
  local: {
    displayName: "Local Sale",
    searchUrlTemplate: null,
    badgeClass: "mp-badge--local",
  },
  donate: {
    displayName: "Donate",
    searchUrlTemplate: null,
    badgeClass: "mp-badge--donate",
  },
};

/**
 * Map channel recommendation strings to ListingSource keys.
 * The sell-channel-recommender produces strings like "Facebook Marketplace",
 * "eBay", "OfferUp", "Base Yard Sale / On-post Sale", "Donate (tax deduction)".
 */
export function channelToSource(channel: string): ListingSource {
  const lower = channel.toLowerCase();
  if (lower.includes("ebay")) return "ebay";
  if (lower.includes("facebook")) return "facebook";
  if (lower.includes("offerup")) return "offerup";
  if (lower.includes("donate")) return "donate";
  return "local";
}

/**
 * Build a search URL for a marketplace given a query string.
 * Returns null if the marketplace has no web search URL.
 */
export function buildMarketplaceUrl(source: ListingSource, query: string): string | null {
  const config = MARKETPLACE_CONFIG[source];
  if (!config.searchUrlTemplate) return null;
  return config.searchUrlTemplate.replace("{query}", encodeURIComponent(query));
}

// Future: fetchFacebookListings, fetchOfferUpListings — add when server proxies are built

// ---------------------------------------------------------------------------
// Region-specific channel overrides
// ---------------------------------------------------------------------------

export interface RegionChannelNote {
  channel: string;
  note: string;
}

const GUAM_CHANNELS: RegionChannelNote[] = [
  { channel: "Guam Buy & Sell (Facebook)", note: "Most active local marketplace for Guam" },
  { channel: "Andersen AFB Lemon Lot", note: "Vehicle and large-item sales on base" },
  { channel: "Naval Base Guam Yard Sales", note: "Popular for household goods and furniture" },
];

const HAWAII_CHANNELS: RegionChannelNote[] = [
  { channel: "Hawaii Military Buy/Sell (Facebook)", note: "Active military community marketplace" },
];

export function getRegionChannelNotes(region: string | undefined): RegionChannelNote[] {
  switch (region) {
    case "guam": return GUAM_CHANNELS;
    case "hawaii": return HAWAII_CHANNELS;
    default: return [];
  }
}
