import type { UrgencyBucket } from "../../types";
import type { DashboardItem, PcsContext } from "../../hooks/useDashboardState";

// ---------------------------------------------------------------------------
// Session export/import
// ---------------------------------------------------------------------------

const SESSION_VERSION = 2;

export interface DashboardSession {
  version: number;
  items: DashboardItem[];
  pcsContext: PcsContext;
  exportedAt: string;
}

export function exportSession(items: DashboardItem[], pcsContext: PcsContext): string {
  const session: DashboardSession = {
    version: SESSION_VERSION,
    items,
    pcsContext,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(session, null, 2);
}

export function validateSession(raw: unknown): DashboardSession | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== "number" || obj.version > SESSION_VERSION) return null;
  if (!Array.isArray(obj.items)) return null;
  if (!obj.pcsContext || typeof obj.pcsContext !== "object") return null;
  const ctx = obj.pcsContext as Record<string, unknown>;
  if (typeof ctx.pcsDate !== "string" || typeof ctx.userGoal !== "string") return null;
  // Validate items have at minimum id and query
  for (const item of obj.items) {
    if (!item || typeof item !== "object") return null;
    const it = item as Record<string, unknown>;
    if (typeof it.id !== "string" || typeof it.query !== "string") return null;
  }
  return raw as DashboardSession;
}

export function downloadJson(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Weekly timeline planner
// ---------------------------------------------------------------------------

export interface WeekPlan {
  label: string;
  weekIndex: number;
  dateRange: string | null; // "Apr 25–May 1" or null if no PCS date
  startDate: string | null; // ISO date string for ICS export
  items: DashboardItem[];
  weekValue: number;
}

export interface WeeklyPlan {
  weeks: WeekPlan[];
  donate: DashboardItem[];
  sold: DashboardItem[];
  topPriority: DashboardItem[];
  itemWeekMap: Map<string, WeekPlan>; // item.id → assigned week (for list view date display)
  summary: {
    sellNowCount: number;
    totalValueSellNow: number;
    bulkyCount: number;
    totalItems: number;
    soldCount: number;
    totalSoldValue: number;
    remainingValue: number;
  };
  originNote: string | null;
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Build calendar week ranges anchored BACKWARD from PCS date.
 * Index 0 = final week before PCS (most urgent, matches weekKey 0).
 * Index 1 = one week earlier. Etc.
 * This matches weekKey semantics: weekKey 0 = SELL_IMMEDIATELY = closest to PCS.
 */
function buildCalendarRanges(pcsDate: string, weekCount: number): Array<{ start: Date; end: Date; label: string }> {
  const pcs = new Date(pcsDate);
  if (isNaN(pcs.getTime())) return [];
  pcs.setHours(0, 0, 0, 0);

  const ranges: Array<{ start: Date; end: Date; label: string }> = [];
  for (let i = 0; i < weekCount; i++) {
    const end = addDays(pcs, -(i * 7));
    const start = addDays(end, -6);
    const label = `${formatDateShort(start)}–${formatDateShort(end)}`;
    ranges.push({ start, end, label });
  }

  return ranges; // index 0 = closest to PCS, matching weekKey 0
}

// ---------------------------------------------------------------------------
// Origin-aware intelligence (config-driven, not hardcoded per-region)
// ---------------------------------------------------------------------------

/** Regional origin profile: affects timeline urgency and channel guidance */
interface OriginProfile {
  label: string;
  bulkyPenaltyWeeks: number;  // extra weeks earlier for LARGE/OVERSIZED
  nonBulkyPenaltyWeeks: number;
  baseDemandWeight: number;   // 1.0 = full local demand, lower = harder to sell locally
  bulkyDemandWeight: number;  // demand weight for furniture/appliances
  electronicsDemandWeight: number;
  shippingNote: string | null;
}

const ORIGIN_PROFILES: Record<string, OriginProfile> = {
  conus: {
    label: "CONUS",
    bulkyPenaltyWeeks: 0,
    nonBulkyPenaltyWeeks: 0,
    baseDemandWeight: 1.0,
    bulkyDemandWeight: 1.0,
    electronicsDemandWeight: 1.0,
    shippingNote: null,
  },
  guam: {
    label: "Guam",
    bulkyPenaltyWeeks: 2,
    nonBulkyPenaltyWeeks: 1,
    baseDemandWeight: 0.6,
    bulkyDemandWeight: 0.4,
    electronicsDemandWeight: 0.85,
    shippingNote: "Ship cutoff ~6 weeks out — list bulky items first",
  },
  hawaii: {
    label: "Hawaii",
    bulkyPenaltyWeeks: 1,
    nonBulkyPenaltyWeeks: 0,
    baseDemandWeight: 0.8,
    bulkyDemandWeight: 0.6,
    electronicsDemandWeight: 0.9,
    shippingNote: "Island shipping adds ~1 week for large items",
  },
  alaska: {
    label: "Alaska",
    bulkyPenaltyWeeks: 1,
    nonBulkyPenaltyWeeks: 0,
    baseDemandWeight: 0.75,
    bulkyDemandWeight: 0.5,
    electronicsDemandWeight: 0.85,
    shippingNote: "Remote shipping adds lead time for oversized items",
  },
  oconus: {
    label: "OCONUS",
    bulkyPenaltyWeeks: 1,
    nonBulkyPenaltyWeeks: 0,
    baseDemandWeight: 0.7,
    bulkyDemandWeight: 0.5,
    electronicsDemandWeight: 0.8,
    shippingNote: "OCONUS move — list bulky items early",
  },
};

function getOriginProfile(region: string | undefined): OriginProfile {
  if (!region) return ORIGIN_PROFILES.conus;
  return ORIGIN_PROFILES[region] ?? ORIGIN_PROFILES.conus;
}

/** Extra week shift for bulky items at remote origins (config-driven) */
export function shippingPenalty(sizeClass: string | undefined, region: string | undefined): number {
  const profile = getOriginProfile(region);
  const isBulkySize = sizeClass === "LARGE" || sizeClass === "OVERSIZED";
  return isBulkySize ? profile.bulkyPenaltyWeeks : profile.nonBulkyPenaltyWeeks;
}

/** Demand weight modifier based on origin and category (config-driven) */
export function localDemandWeight(category: string | undefined, region: string | undefined): number {
  const profile = getOriginProfile(region);
  if (!category) return profile.baseDemandWeight;
  const lower = category.toLowerCase();
  if (lower.includes("electronics") || lower.includes("camera") || lower.includes("console") || lower.includes("gaming")) {
    return profile.electronicsDemandWeight;
  }
  if (lower.includes("furniture") || lower.includes("appliance") || lower.includes("shelf") || lower.includes("couch")) {
    return profile.bulkyDemandWeight;
  }
  return profile.baseDemandWeight;
}

/** Get the shipping note for the current region, or null */
export function getOriginShippingNote(region: string | undefined): string | null {
  return getOriginProfile(region).shippingNote;
}

// ---------------------------------------------------------------------------
// JTR Weight Allowance (initial stub)
// ---------------------------------------------------------------------------

/**
 * Basic JTR weight allowance lookup by pay grade.
 * This is a simplified table — a full implementation would also consider
 * dependents, move type (CONUS vs OCONUS), and TLE entitlements.
 * Values are approximate 2026 JTR household goods allowances in pounds.
 */
const JTR_WEIGHT_TABLE: Record<string, number> = {
  E1: 5000, E2: 5000, E3: 5000, E4: 7000,
  E5: 7000, E6: 8000, E7: 11000, E8: 12000, E9: 13000,
  W1: 7000, W2: 8000, W3: 8500, W4: 9000, W5: 9500,
  O1: 10000, O2: 12500, O3: 13000, O4: 14000,
  O5: 16000, O6: 18000, O7: 18000, O8: 18000, O9: 18000, O10: 18000,
};

export function getJtrWeightAllowance(payGrade: string | undefined): number | null {
  if (!payGrade) return null;
  return JTR_WEIGHT_TABLE[payGrade.toUpperCase()] ?? null;
}

/**
 * Check if weight is tight relative to allowance.
 * Returns a factor 0-1 where 1 = very tight (over or near limit).
 * Used to boost urgency for heavy/bulky items when the move is weight-constrained.
 */
export function weightPressure(totalWeightLbs: number | undefined, allowanceLbs: number | undefined): number {
  if (!totalWeightLbs || !allowanceLbs || allowanceLbs <= 0) return 0;
  const ratio = totalWeightLbs / allowanceLbs;
  if (ratio >= 1.0) return 1.0;  // over limit
  if (ratio >= 0.9) return 0.8;  // near limit
  if (ratio >= 0.75) return 0.5; // getting tight
  return 0;                       // plenty of room
}

// ---------------------------------------------------------------------------
// Weekly planner
// ---------------------------------------------------------------------------

const isBulky = (it: DashboardItem) =>
  it.sizeClass === "LARGE" || it.sizeClass === "OVERSIZED";

/**
 * Build a deterministic weekly sell plan from analyzed dashboard items.
 *
 * Algorithm:
 * 1. Separate sold, NOT_WORTH_SELLING, and active sellable items
 * 2. Sort by urgency bucket → score DESC → bulky first
 * 3. Assign to weeks: SELL_IMMEDIATELY/SELL_THIS_WEEK → 0, SELL_SOON → 1, etc.
 * 4. Bulky items shift earlier; Guam/remote regions shift even earlier
 * 5. Anchor weeks to calendar dates when pcsDate is provided
 */
export function buildWeeklyPlan(items: DashboardItem[], pcsContext?: PcsContext): WeeklyPlan {
  const region = pcsContext?.region;
  const originNote = getOriginShippingNote(region);

  // Partition items
  const sold = items.filter(it => it.status === "sold");
  const analyzed = items.filter(it => it.status === "analyzed" && it.priority);
  const donate: DashboardItem[] = [];
  const sellable: DashboardItem[] = [];

  for (const item of analyzed) {
    if (item.priority!.urgency.bucket === "NOT_WORTH_SELLING") {
      donate.push(item);
    } else {
      sellable.push(item);
    }
  }

  // Sort
  const bucketIdx = (it: DashboardItem) =>
    BUCKET_ORDER.indexOf(it.priority!.urgency.bucket);

  sellable.sort((a, b) => {
    const ai = bucketIdx(a);
    const bi = bucketIdx(b);
    if (ai !== bi) return ai - bi;
    const scoreDiff = b.priority!.urgency.score - a.priority!.urgency.score;
    if (scoreDiff !== 0) return scoreDiff;
    if (isBulky(a) && !isBulky(b)) return -1;
    if (!isBulky(a) && isBulky(b)) return 1;
    return 0;
  });

  // Map bucket to base week index (0-based)
  const bucketToWeek: Record<string, number> = {
    SELL_IMMEDIATELY: 0,
    SELL_THIS_WEEK: 0,
    SELL_SOON: 1,
    PLAN_TO_SELL: 2,
    LOW_URGENCY: 3,
  };

  // Build weeks map
  const weeksMap = new Map<number, DashboardItem[]>();

  for (const item of sellable) {
    const bucket = item.priority!.urgency.bucket;
    let weekIdx = bucketToWeek[bucket] ?? 3;

    // Origin-aware shift (includes bulky penalty for remote regions)
    // shippingPenalty already accounts for bulky vs non-bulky per region
    const penalty = shippingPenalty(item.sizeClass, region);
    if (penalty > 0) {
      weekIdx = Math.max(0, weekIdx - penalty);
    } else if (isBulky(item) && weekIdx > 0) {
      // CONUS-only: bulky items shift 1 week earlier
      weekIdx -= 1;
    }

    if (!weeksMap.has(weekIdx)) weeksMap.set(weekIdx, []);
    weeksMap.get(weekIdx)!.push(item);
  }

  // Build calendar date ranges
  const maxWeekIdx = weeksMap.size > 0 ? Math.max(...weeksMap.keys()) + 1 : 0;
  const calendarRanges = pcsContext?.pcsDate
    ? buildCalendarRanges(pcsContext.pcsDate, Math.max(maxWeekIdx, 4))
    : null;

  // Convert to sorted array — skip empty gap weeks
  const sortedWeekKeys = [...weeksMap.keys()].sort((a, b) => a - b);
  const weeks: WeekPlan[] = [];
  for (let seqIdx = 0; seqIdx < sortedWeekKeys.length; seqIdx++) {
    const weekKey = sortedWeekKeys[seqIdx];
    const weekItems = weeksMap.get(weekKey)!;
    const weekValue = weekItems.reduce((sum, it) => {
      const p = it.priority?.pricing.recommendedPrice;
      return sum + (p ?? 0);
    }, 0);
    const range = calendarRanges?.[weekKey];
    weeks.push({
      label: `Week ${seqIdx + 1}`,
      weekIndex: seqIdx,
      dateRange: range?.label ?? null,
      startDate: range ? range.start.toISOString() : null,
      items: weekItems,
      weekValue,
    });
  }

  // Summary
  const sellNowItems = sellable.filter(it =>
    it.priority!.urgency.bucket === "SELL_IMMEDIATELY" ||
    it.priority!.urgency.bucket === "SELL_THIS_WEEK"
  );
  const totalValueSellNow = sellNowItems.reduce((sum, it) => sum + (it.priority?.pricing.recommendedPrice ?? 0), 0);
  const bulkyCount = sellable.filter(isBulky).length;

  // Sold metrics
  const soldCount = sold.length;
  const totalSoldValue = sold.reduce((sum, it) => {
    return sum + (it.soldPrice ?? it.priority?.pricing.recommendedPrice ?? 0);
  }, 0);
  const allAnalyzedValue = analyzed.reduce((sum, it) => {
    return sum + (it.priority?.pricing.recommendedPrice ?? 0);
  }, 0);

  // Build reverse lookup: item.id → assigned WeekPlan
  const itemWeekMap = new Map<string, WeekPlan>();
  for (const week of weeks) {
    for (const item of week.items) {
      itemWeekMap.set(item.id, week);
    }
  }

  // Top 3 priority items: highest urgency score among sellable, not sold
  const topPriority = [...sellable]
    .sort((a, b) => b.priority!.urgency.score - a.priority!.urgency.score)
    .slice(0, 3);

  return {
    weeks,
    donate,
    sold,
    topPriority,
    itemWeekMap,
    summary: {
      sellNowCount: sellNowItems.length,
      totalValueSellNow,
      bulkyCount,
      totalItems: analyzed.length + soldCount,
      soldCount,
      totalSoldValue,
      remainingValue: Math.max(0, allAnalyzedValue - totalSoldValue),
    },
    originNote,
  };
}

// ---------------------------------------------------------------------------
// ICS calendar export
// ---------------------------------------------------------------------------

/**
 * Generate ICS with one event per item, aligned to its assigned timeline week.
 * Each event includes price, channel, urgency, and recommendation.
 */
export function generateIcs(plan: WeeklyPlan, pcsDate: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PCS MoveIQ//Sell Plan//EN",
  ];

  const pcs = new Date(pcsDate);
  pcs.setHours(0, 0, 0, 0);
  const now = Date.now();

  for (const week of plan.weeks) {
    for (const item of week.items) {
      if (item.status === "sold") continue;
      const p = item.priority;
      if (!p) continue;

      // Use the week's actual start date if available, else offset from today
      let eventStart: Date;
      if (week.startDate) {
        eventStart = new Date(week.startDate);
      } else {
        eventStart = addDays(new Date(), week.weekIndex * 7);
      }
      const eventEnd = addDays(eventStart, 1);

      const dtStart = eventStart.toISOString().replace(/[-:]/g, "").split("T")[0];
      const dtEnd = eventEnd.toISOString().replace(/[-:]/g, "").split("T")[0];

      const price = p.pricing.recommendedPrice;
      const channel = p.channels[0]?.channel ?? "any marketplace";
      const bucket = BUCKET_DISPLAY[p.urgency.bucket] ?? p.urgency.bucket;
      const strategy = p.pricing.pricingStrategy;

      const desc = [
        price ? `Price: $${price}` : null,
        `Channel: ${channel}`,
        `Urgency: ${bucket} (${p.urgency.score}/100)`,
        strategy ? `Strategy: ${strategy}` : null,
      ].filter(Boolean).join("\\n");

      lines.push("BEGIN:VEVENT");
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      lines.push(`SUMMARY:Sell ${item.query}`);
      lines.push(`DESCRIPTION:${desc}`);
      lines.push(`UID:pcs-moveiq-${item.id}-${now}@moveiq`);
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatPrice(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function healthLabel(health: string): string {
  switch (health) {
    case "strong": return "Strong market";
    case "moderate": return "Moderate market";
    case "weak": return "Weak market";
    case "insufficient": return "Insufficient data";
    default: return health;
  }
}

export const BUCKET_DISPLAY: Record<UrgencyBucket, string> = {
  SELL_IMMEDIATELY: "Sell Immediately",
  SELL_THIS_WEEK: "Sell This Week",
  SELL_SOON: "Sell Soon",
  PLAN_TO_SELL: "Plan to Sell",
  LOW_URGENCY: "Low Urgency",
  NOT_WORTH_SELLING: "Consider Donating",
};

export const BUCKET_CSS: Record<UrgencyBucket, string> = {
  SELL_IMMEDIATELY: "critical",
  SELL_THIS_WEEK: "high",
  SELL_SOON: "moderate",
  PLAN_TO_SELL: "low",
  LOW_URGENCY: "minimal",
  NOT_WORTH_SELLING: "donate",
};

/** Ordered from most to least urgent for sorting */
export const BUCKET_ORDER: UrgencyBucket[] = [
  "SELL_IMMEDIATELY",
  "SELL_THIS_WEEK",
  "SELL_SOON",
  "PLAN_TO_SELL",
  "LOW_URGENCY",
  "NOT_WORTH_SELLING",
];
