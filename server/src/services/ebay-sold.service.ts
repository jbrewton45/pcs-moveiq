/**
 * ebay-sold.service.ts — eBay Finding API integration for sold/completed listings.
 *
 * Uses the Finding API `findCompletedItems` operation with `soldItemsOnly=true`
 * to return items that actually sold (not just completed without sale).
 *
 * Auth: Finding API uses the App ID directly in a header, no OAuth required.
 * The existing EBAY_APP_ID env var is sufficient.
 */

const FINDING_API_BASE = "https://svcs.ebay.com/services/search/FindingService/v1";

const CONDITION_MAP: Record<string, string> = {
  NEW: "1000",
  LIKE_NEW: "1500",
  GOOD: "3000",
  FAIR: "4000",
  POOR: "5000",
};

export interface SoldListing {
  title: string;
  price: number;
  currency: string;
  url: string;
  condition?: string;
  soldDate?: string;
}

export interface SoldListingsResult {
  query: string;
  totalFound: number;
  avgPrice: number;
  medianPrice: number;
  lowPrice: number;
  highPrice: number;
  sampleListings: SoldListing[];
}

function removeOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices;
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return sorted.filter(p => p >= lower && p <= upper);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function searchEbaySoldListings(
  query: string,
  condition?: string,
  keywords?: string,
  limit: number = 20,
): Promise<SoldListingsResult | null> {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    console.warn("[ebay-sold] EBAY_APP_ID not configured");
    return null;
  }

  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "",
    "keywords": keywords ? `${query} ${keywords}` : query,
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "paginationInput.entriesPerPage": String(Math.min(limit, 100)),
    "sortOrder": "EndTimeSoonest",
  });

  let filterIdx = 1;

  if (condition && CONDITION_MAP[condition.toUpperCase()]) {
    params.set(`itemFilter(${filterIdx}).name`, "Condition");
    params.set(`itemFilter(${filterIdx}).value`, CONDITION_MAP[condition.toUpperCase()]);
    filterIdx++;
  }

  // Restrict to eBay US
  params.set("GLOBAL-ID", "EBAY-US");

  const url = `${FINDING_API_BASE}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      headers: { "X-EBAY-SOA-SECURITY-APPNAME": appId },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const json = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      console.error(`[ebay-sold] Finding API ${response.status}: ${response.statusText}`, JSON.stringify(json).slice(0, 500));
      return null;
    }

    // Check for top-level error (happens on auth failure or rate limit BEFORE response wrapping)
    const topError = (json as { errorMessage?: Array<{ error?: Array<{ message?: string[]; errorId?: string[] }> }> })
      ?.errorMessage?.[0]?.error?.[0];
    if (topError) {
      const errorId = topError.errorId?.[0] ?? "";
      const errorMsg = topError.message?.[0] ?? "unknown error";
      console.error(`[ebay-sold] API error ${errorId}: ${errorMsg}`);
      return null;
    }

    // Finding API wraps successful responses in findCompletedItemsResponse[0]
    const root = (json as Record<string, unknown[]>)
      ?.findCompletedItemsResponse?.[0] as Record<string, unknown[]> | undefined;

    if (!root) {
      console.warn("[ebay-sold] unexpected response shape");
      return null;
    }

    const ack = (root.ack as string[])?.[0];
    if (ack !== "Success" && ack !== "Warning") {
      const errorMsg = (root.errorMessage as Array<{ error?: Array<{ message?: string[] }> }>)
        ?.[0]?.error?.[0]?.message?.[0] ?? "unknown error";
      console.error(`[ebay-sold] API error: ${errorMsg}`);
      return null;
    }

    const totalEntries = parseInt(
      ((root.paginationOutput as Array<{ totalEntries?: string[] }>)?.[0]?.totalEntries?.[0]) ?? "0",
      10,
    );

    const searchResult = root.searchResult as Array<{
      item?: Array<Record<string, unknown>>;
      "@count"?: string;
    }> | undefined;

    const items = searchResult?.[0]?.item ?? [];

    const listings: SoldListing[] = [];

    for (const item of items) {
      const title = (item.title as string[])?.[0];
      const viewUrl = (item.viewItemURL as string[])?.[0];
      const sellingStatus = (item.sellingStatus as Array<Record<string, unknown>>)?.[0];
      const currentPrice = (sellingStatus?.currentPrice as Array<{ __value__?: string; "@currencyId"?: string }>)?.[0];
      const priceVal = parseFloat(currentPrice?.__value__ ?? "");
      const currency = currentPrice?.["@currencyId"] ?? "USD";
      const conditionInfo = (item.condition as Array<{ conditionDisplayName?: string[] }>)?.[0];
      const conditionName = conditionInfo?.conditionDisplayName?.[0];
      const listingInfo = (item.listingInfo as Array<{ endTime?: string[] }>)?.[0];
      const endTime = listingInfo?.endTime?.[0];

      if (!title || isNaN(priceVal) || priceVal <= 0) continue;

      listings.push({
        title,
        price: Math.round(priceVal * 100) / 100,
        currency: currency as string,
        url: viewUrl ?? "",
        condition: conditionName,
        soldDate: endTime,
      });
    }

    if (listings.length === 0) {
      return {
        query,
        totalFound: totalEntries,
        avgPrice: 0,
        medianPrice: 0,
        lowPrice: 0,
        highPrice: 0,
        sampleListings: [],
      };
    }

    const allPrices = listings.map(l => l.price);
    const cleanPrices = removeOutliers(allPrices);
    const sorted = [...cleanPrices].sort((a, b) => a - b);
    const avg = Math.round((sorted.reduce((s, p) => s + p, 0) / sorted.length) * 100) / 100;

    return {
      query,
      totalFound: totalEntries,
      avgPrice: avg,
      medianPrice: Math.round(median(sorted) * 100) / 100,
      lowPrice: sorted[0],
      highPrice: sorted[sorted.length - 1],
      sampleListings: listings.slice(0, 10),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[ebay-sold] request timed out (15s)");
    } else {
      console.error("[ebay-sold] request failed:", err instanceof Error ? err.message : err);
    }
    return null;
  }
}
