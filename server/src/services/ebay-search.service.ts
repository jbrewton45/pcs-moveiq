import { getAccessToken, isEbayAvailable } from "../providers/ebay.provider.js";

export interface EbaySearchResult {
  itemId: string;
  title: string;
  price: number | null;
  currency: string;
  condition: string;
  itemWebUrl: string | null;
  imageUrl: string | null;
  sellerUsername: string | null;
  shippingCost: number | null;
  buyingOptions: string[];
  itemLocation: string | null;
  categoryPath: string | null;
}

interface EbayApiItem {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  condition?: string;
  conditionId?: string;
  itemWebUrl?: string;
  thumbnailImages?: { imageUrl?: string }[];
  image?: { imageUrl?: string };
  seller?: { username?: string };
  shippingOptions?: { shippingCost?: { value?: string } }[];
  buyingOptions?: string[];
  itemLocation?: { postalCode?: string; city?: string; stateOrProvince?: string; country?: string };
  categories?: { categoryName?: string }[];
}

interface EbaySearchApiResponse {
  itemSummaries?: EbayApiItem[];
  total?: number;
  next?: string;
  offset?: number;
  limit?: number;
}

function normalizeItem(item: EbayApiItem): EbaySearchResult {
  const priceVal = item.price?.value ? parseFloat(item.price.value) : null;

  const shippingVal = item.shippingOptions?.[0]?.shippingCost?.value
    ? parseFloat(item.shippingOptions[0].shippingCost.value)
    : null;

  const loc = item.itemLocation;
  const locationParts = [loc?.city, loc?.stateOrProvince, loc?.country].filter(Boolean);

  const categoryPath = item.categories
    ?.map(c => c.categoryName)
    .filter(Boolean)
    .join(" > ") || null;

  return {
    itemId: item.itemId ?? "",
    title: item.title ?? "",
    price: priceVal !== null && !isNaN(priceVal) && priceVal > 0 ? priceVal : null,
    currency: item.price?.currency ?? "USD",
    condition: item.condition ?? "Not Specified",
    itemWebUrl: item.itemWebUrl ?? null,
    imageUrl: item.thumbnailImages?.[0]?.imageUrl ?? item.image?.imageUrl ?? null,
    sellerUsername: item.seller?.username ?? null,
    shippingCost: shippingVal !== null && !isNaN(shippingVal) ? shippingVal : null,
    buyingOptions: Array.isArray(item.buyingOptions) ? item.buyingOptions : [],
    itemLocation: locationParts.length > 0 ? locationParts.join(", ") : null,
    categoryPath,
  };
}

export async function searchEbayListings(
  query: string,
  limit = 10,
  offset = 0,
  filter?: string,
): Promise<{ results: EbaySearchResult[]; total: number } | null> {
  if (!isEbayAvailable()) {
    console.warn("[eBay Search] eBay not configured (missing EBAY_APP_ID)");
    return null;
  }

  const token = await getAccessToken();
  if (!token) {
    console.error("[eBay Search] Failed to obtain access token");
    return null;
  }

  const clampedLimit = Math.min(Math.max(1, limit), 50);
  const clampedOffset = Math.max(0, offset);

  const params = new URLSearchParams({
    q: query,
    limit: String(clampedLimit),
    offset: String(clampedOffset),
  });
  if (filter) {
    params.set("filter", filter);
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      },
    });

    if (response.status === 401) {
      // Token expired mid-flight — log but don't retry (caller can retry)
      console.warn("[eBay Search] 401 — token may have expired");
      return null;
    }

    if (response.status === 429) {
      console.warn("[eBay Search] 429 — rate limited");
      return null;
    }

    if (!response.ok) {
      console.error(`[eBay Search] API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as EbaySearchApiResponse;

    const results = (data.itemSummaries ?? [])
      .map(normalizeItem)
      .filter(r => r.itemId && r.title);

    return {
      results,
      total: data.total ?? results.length,
    };
  } catch (err) {
    console.error("[eBay Search] Request failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
