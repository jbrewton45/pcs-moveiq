import type { Item, ItemCondition, SizeClass } from "../types/domain.js";
import { getProjectById } from "./projects.service.js";
import { listItemsByProject } from "./items.service.js";
import { query } from "../data/database.js";

// ── Public types ────────────────────────────────────────────────────────────

export type DecisionBucket = "sell" | "keep" | "ship" | "donate";

/**
 * Per-band raw contributions (pre-multiplier). If decision.intent === "keep",
 * the caller applies a 0.1× multiplier to the SUM to produce the final score —
 * so the individual band values here may not sum to the `score` field in that
 * case. Each number is a non-negative integer.
 */
export interface ScoreBreakdown {
  value: number;
  size: number;
  urgency: number;
  condition: number;
  sellBonus: number;
}

export type CalibrationConfidence = "low" | "medium" | "high";

export interface PrioritizedItem {
  itemId: string;
  score: number;                // 0–100, integer
  recommendation: DecisionBucket;
  reason: string;
  breakdown: ScoreBreakdown;
  /** Phase 12–13: present when the item's category has ≥3 historical sales in
   *  this project so the value band was calibrated. The multiplier is the
   *  average of (soldPriceUsd / priceFairMarket) across prior sales, clamped.
   *  Phase 13 adds sampleSize + variance + confidence so the UI can show
   *  how much to trust the adjustment. */
  calibration?: {
    category: string;
    multiplier: number;
    sampleSize: number;
    variance: number;
    confidence: CalibrationConfidence;
  };
}

/** Phase 12 tuning constants (kept inline so the math stays explainable). */
const MIN_SAMPLES_FOR_CALIBRATION = 3;
const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 1.5;

/** Lower-case + trim so categories like "Furniture" and "furniture " agree. */
function normCategory(s: string): string {
  return s.trim().toLowerCase();
}

/** One calibration record per category: clamped average ratio + spread stats. */
export interface CalibrationEntry {
  multiplier: number;
  sampleSize: number;
  /** Population variance of the sold/estimate ratios. Informational. */
  variance: number;
  confidence: CalibrationConfidence;
}

/** category (normalized) → calibration record. */
export type PriceCalibration = Map<string, CalibrationEntry>;

/** Coefficient-of-variation threshold above which confidence is downgraded. */
const HIGH_VARIANCE_COV = 0.35;

/** Derives the confidence level from sample size and dispersion. */
function deriveConfidence(sampleSize: number, stddev: number, mean: number): CalibrationConfidence {
  let level: CalibrationConfidence;
  if (sampleSize > 10)      level = "high";
  else if (sampleSize >= 5) level = "medium";
  else                       level = "low";

  // High variance — downgrade one step. (Low stays low.)
  const cov = mean > 0 ? stddev / mean : 0;
  if (cov > HIGH_VARIANCE_COV) {
    if (level === "high")        level = "medium";
    else if (level === "medium") level = "low";
  }
  return level;
}

// ── Bands (pure, deterministic) ─────────────────────────────────────────────

function valueBand(valueUsd: number): number {
  if (valueUsd >= 500) return 30;
  if (valueUsd >= 100) return 22;
  if (valueUsd >= 50)  return 14;
  if (valueUsd >= 30)  return 8;
  if (valueUsd >= 10)  return 3;
  return 0;
}

function sizeBand(sizeClass: SizeClass, weightLbs: number | undefined): number {
  let base = 0;
  switch (sizeClass) {
    case "OVERSIZED": base = 20; break;
    case "LARGE":     base = 14; break;
    case "MEDIUM":    base = 6;  break;
    case "SMALL":     base = 1;  break;
  }
  if (weightLbs != null) {
    if (weightLbs >= 50) base += 5;
    else if (weightLbs >= 20) base += 3;
  }
  return Math.min(20, base);
}

function urgencyBand(hardMoveDateIso: string | null | undefined): number {
  if (!hardMoveDateIso) return 0;
  const hardMove = Date.parse(hardMoveDateIso);
  if (Number.isNaN(hardMove)) return 0;
  const now = Date.now();
  const days = Math.floor((hardMove - now) / (1000 * 60 * 60 * 24));
  if (days <= 14) return 25;
  if (days <= 30) return 18;
  if (days <= 60) return 10;
  if (days <= 90) return 5;
  return 0;
}

function conditionBand(condition: ItemCondition): number {
  switch (condition) {
    case "POOR": return 15;
    case "FAIR": return 8;
    case "GOOD": return 2;
    case "LIKE_NEW":
    case "NEW":  return 0;
    default:     return 0;
  }
}

// ── Bucket + reason ─────────────────────────────────────────────────────────

function currency(usd: number): string {
  if (usd >= 1) return `$${Math.round(usd)}`;
  return `$${usd.toFixed(2)}`;
}

function categorize(item: Item, valueUsd: number, decision: { intent?: string } | null): { bucket: DecisionBucket; reason: string } {
  if (decision?.intent === "keep") return { bucket: "keep", reason: "Marked as keep" };

  if (item.condition === "POOR") {
    return { bucket: "donate", reason: "Poor condition — donate or discard" };
  }

  const isLarge = item.sizeClass === "LARGE" || item.sizeClass === "OVERSIZED";
  if (isLarge && valueUsd < 30) {
    return { bucket: "donate", reason: "Bulky & under $30 — donate and save the weight" };
  }

  if (valueUsd >= 100 && decision?.intent === "sell") {
    return { bucket: "sell", reason: `${currency(valueUsd)} fair market — sell to fund the move` };
  }
  if (valueUsd >= 50) {
    return { bucket: "sell", reason: `${currency(valueUsd)} fair market — worth selling` };
  }

  if (isLarge) {
    return { bucket: "ship", reason: "Bulky keeper — ship with household goods" };
  }
  return { bucket: "ship", reason: "Small everyday item — pack and ship" };
}

// ── Scoring + orchestration ─────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function scoreItem(
  item: Item,
  hardMoveDateIso: string | null | undefined,
  calibration?: PriceCalibration,
  decision?: { intent?: string } | null,
): PrioritizedItem {
  const rawValueUsd = item.priceFairMarket ?? item.priceFastSale ?? 0;

  // Phase 12: if this category has prior sales in the project, scale the value
  // by the calibration multiplier BEFORE band lookup. Nothing else in the
  // scoring pipeline changes — same bands, same weights, same multipliers.
  const calEntry = calibration?.get(normCategory(item.category));
  const catMultiplier = calEntry?.multiplier;
  const valueUsd = catMultiplier != null ? rawValueUsd * catMultiplier : rawValueUsd;

  const breakdown: ScoreBreakdown = {
    value:     valueBand(valueUsd),
    size:      sizeBand(item.sizeClass, item.weightLbs),
    urgency:   urgencyBand(hardMoveDateIso),
    condition: conditionBand(item.condition),
    sellBonus: decision?.intent === "sell" ? 10 : 0,
  };

  let raw = breakdown.value + breakdown.size + breakdown.urgency + breakdown.condition + breakdown.sellBonus;

  if (decision?.intent === "keep") raw *= 0.1;

  const score = clamp(Math.round(raw), 0, 100);
  // Use the calibrated value for bucket thresholds too — otherwise a $150 item
  // in a category that historically sells at 40% would still bucket as "sell"
  // when its realistic value is $60.
  const { bucket, reason } = categorize(item, valueUsd, decision ?? null);

  const out: PrioritizedItem = { itemId: item.id, score, recommendation: bucket, reason, breakdown };
  if (calEntry != null) {
    out.calibration = {
      category: item.category,
      multiplier: calEntry.multiplier,
      sampleSize: calEntry.sampleSize,
      variance: calEntry.variance,
      confidence: calEntry.confidence,
    };
  }
  return out;
}

/**
 * Build a per-category multiplier from this project's historical sales.
 *
 *   multiplier(cat) = avg( soldPriceUsd / priceFairMarket )
 *
 * Only categories with at least MIN_SAMPLES_FOR_CALIBRATION prior sales get
 * a multiplier. The result is clamped to [MIN_MULTIPLIER, MAX_MULTIPLIER] so
 * a couple of outlier sales can't overwhelm the recommendation.
 */
export async function getPriceCalibration(projectId: string): Promise<PriceCalibration> {
  const result = await query(
    `SELECT category, "soldPriceUsd", "priceFairMarket"
       FROM items
      WHERE "projectId" = $1
        AND status = 'SOLD'
        AND "soldPriceUsd" IS NOT NULL
        AND "priceFairMarket" IS NOT NULL
        AND "priceFairMarket" > 0`,
    [projectId]
  );

  const groups = new Map<string, number[]>();
  for (const r of result.rows) {
    const row = r as { category: string; soldPriceUsd: number; priceFairMarket: number };
    const ratio = row.soldPriceUsd / row.priceFairMarket;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const cat = normCategory(row.category);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(ratio);
  }

  const calibration: PriceCalibration = new Map();
  for (const [cat, ratios] of groups) {
    if (ratios.length < MIN_SAMPLES_FOR_CALIBRATION) continue;
    const n = ratios.length;
    const mean = ratios.reduce((s, v) => s + v, 0) / n;
    // Population variance (we treat the project's prior sales as the full
    // population we care about, not a sample of a wider one).
    const variance = ratios.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
    const stddev = Math.sqrt(variance);
    const clamped = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, mean));
    calibration.set(cat, {
      multiplier: clamped,
      sampleSize: n,
      variance,
      confidence: deriveConfidence(n, stddev, mean),
    });
  }
  return calibration;
}

/** Statuses that mean the user has made a decision (intent or outcome) — excluded
 *  from prioritization so the "Do This First" list shows only undecided items.
 *  UNREVIEWED is the only status that remains in the active pool. */
const DECIDED_STATUSES = new Set<string>([
  "REVIEWED", "LISTED", "KEPT", "SOLD", "DONATED", "SHIPPED", "DISCARDED",
]);

export async function prioritizeProject(
  projectId: string,
  opts: { limit?: number } = {},
): Promise<PrioritizedItem[]> {
  const [project, items, calibration] = await Promise.all([
    getProjectById(projectId),
    listItemsByProject(projectId),
    getPriceCalibration(projectId),
  ]);
  const hardMoveDate = project?.hardMoveDate ?? null;
  const active = items.filter((it) => !DECIDED_STATUSES.has(it.status));

  // Fetch decision rows for all active items in one query
  const activeIds = active.map((it) => it.id);
  const decisionMap = new Map<string, string>();
  if (activeIds.length > 0) {
    const decResult = await query(
      'SELECT "itemId", intent FROM item_decisions WHERE "itemId" = ANY($1)',
      [activeIds]
    );
    for (const row of decResult.rows as { itemId: string; intent: string }[]) {
      decisionMap.set(row.itemId, row.intent);
    }
  }

  const scored = active.map((it) => {
    const intent = decisionMap.get(it.id);
    const decision = intent != null ? { intent } : null;
    return scoreItem(it, hardMoveDate, calibration, decision);
  });

  // Sort by score desc; tiebreaker on itemId asc to keep results stable.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.itemId.localeCompare(b.itemId);
  });
  return opts.limit != null ? scored.slice(0, opts.limit) : scored;
}
