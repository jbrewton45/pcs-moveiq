import type { ComparableCandidate, ComparableLookupInput } from "../types/providers.js";

// Cached OAuth token state
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export function isEbayAvailable(): boolean {
  return !!process.env.EBAY_APP_ID;
}

export async function getAccessToken(): Promise<string | null> {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;

  if (!appId || !certId) return null;

  // Return cached token if still valid (with 60s buffer)
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  try {
    const credentials = Buffer.from(`${appId}:${certId}`).toString("base64");

    const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });

    if (!response.ok) {
      console.error(`eBay OAuth failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as { access_token?: string; expires_in?: number };

    if (!data.access_token) {
      console.error("eBay OAuth response missing access_token");
      return null;
    }

    cachedToken = data.access_token;
    // expires_in is in seconds; default to 2 hours if missing
    tokenExpiresAt = now + (data.expires_in ?? 7200) * 1000;

    return cachedToken;
  } catch (err) {
    console.error("eBay getAccessToken error:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Maps our ItemCondition values to eBay condition filter IDs
const CONDITION_FILTER_MAP: Record<string, string> = {
  NEW: "conditionIds:{1000}",
  LIKE_NEW: "conditionIds:{1500|1750|2000|2500}",
  GOOD: "conditionIds:{3000}",
  FAIR: "conditionIds:{5000}",
  POOR: "conditionIds:{6000}",
};

export function buildEbaySearchQuery(input: ComparableLookupInput): string {
  if (input.brand && input.model) {
    return `${input.brand} ${input.model}`.trim();
  }
  if (input.brand) {
    return `${input.brand} ${input.itemName}`.trim();
  }
  return input.itemName.trim();
}

interface EbayItemSummary {
  title?: string;
  itemWebUrl?: string;
  thumbnailImages?: { imageUrl?: string }[];
  price?: { value?: string };
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
}

export async function ebayComparables(input: ComparableLookupInput): Promise<ComparableCandidate[] | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const query = buildEbaySearchQuery(input);
    const conditionFilter = CONDITION_FILTER_MAP[input.condition] ?? CONDITION_FILTER_MAP["GOOD"];

    const params = new URLSearchParams({
      q: query,
      limit: "5",
      filter: conditionFilter,
    });

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`eBay Browse API failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as EbaySearchResponse;

    if (!data.itemSummaries || data.itemSummaries.length === 0) {
      return [];
    }

    const candidates: ComparableCandidate[] = data.itemSummaries
      .filter(item => item.price?.value !== undefined)
      .map(item => ({
        title: item.title ?? query,
        source: "ebay" as const,
        url: item.itemWebUrl,
        thumbnailUrl: item.thumbnailImages?.[0]?.imageUrl,
        price: parseFloat(item.price!.value!),
        soldStatus: "LISTED",
      }))
      .filter(c => !isNaN(c.price) && c.price > 0);

    return candidates;
  } catch (err) {
    console.error("ebayComparables error:", err instanceof Error ? err.message : err);
    return null;
  }
}
