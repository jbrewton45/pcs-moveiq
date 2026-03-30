import type {
  UrgencyInput,
  UrgencyOutput,
  UrgencyBucket,
  MarketHealthLevel,
  SaleSpeedEstimate,
  SaleSpeedBand,
} from "../types/sell-priority.types.js";

// ---------------------------------------------------------------------------
// Factor 1: Time Pressure (0-40 pts)
// ---------------------------------------------------------------------------

function scoreTimePressure(
  daysUntilPCS: number | null,
  daysUntilPackout: number | null,
): { points: number; effectiveDeadline: number | null; reason: string } {
  // Use the earlier of the two dates as the effective deadline
  const candidates: number[] = [];
  if (daysUntilPCS !== null) candidates.push(daysUntilPCS);
  if (daysUntilPackout !== null) candidates.push(daysUntilPackout);

  if (candidates.length === 0) {
    return { points: 0, effectiveDeadline: null, reason: "No PCS or packout date provided (+0)" };
  }

  const effectiveDeadline = Math.min(...candidates);
  const deadlineLabel = effectiveDeadline === daysUntilPackout ? "packout" : "PCS";

  let points: number;
  let pressureLabel: string;

  if (effectiveDeadline <= 7) {
    points = 40;
    pressureLabel = "critical time pressure";
  } else if (effectiveDeadline <= 14) {
    points = 32;
    pressureLabel = "high time pressure";
  } else if (effectiveDeadline <= 30) {
    points = 20;
    pressureLabel = "moderate time pressure";
  } else if (effectiveDeadline <= 60) {
    points = 10;
    pressureLabel = "low time pressure";
  } else {
    points = 5;
    pressureLabel = "minimal time pressure";
  }

  const reason =
    `${deadlineLabel} in ${effectiveDeadline} day${effectiveDeadline === 1 ? "" : "s"} — ${pressureLabel} (+${points})`;

  return { points, effectiveDeadline, reason };
}

// ---------------------------------------------------------------------------
// Factor 2: Market Liquidity (0-20 pts)
// ---------------------------------------------------------------------------

const MARKET_LIQUIDITY_POINTS: Record<MarketHealthLevel, number> = {
  strong: 20,
  moderate: 14,
  weak: 8,
  insufficient: 4,
};

function scoreMarketLiquidity(health: MarketHealthLevel): { points: number; reason: string } {
  const points = MARKET_LIQUIDITY_POINTS[health];
  const labels: Record<MarketHealthLevel, string> = {
    strong: "Strong market demand",
    moderate: "Moderate market demand",
    weak: "Weak market demand",
    insufficient: "Insufficient market data",
  };
  return { points, reason: `${labels[health]} (+${points})` };
}

// ---------------------------------------------------------------------------
// Factor 3: Value Signal (0-15 pts)
// ---------------------------------------------------------------------------

function scoreValueSignal(fairMarketPrice: number | null): { points: number; reason: string } {
  if (fairMarketPrice === null || fairMarketPrice <= 30) {
    const points = 3;
    const label = fairMarketPrice === null
      ? "No market price available"
      : `Low-value item at $${fairMarketPrice}`;
    return { points, reason: `${label} (+${points})` };
  }

  let points: number;
  let label: string;

  if (fairMarketPrice > 300) {
    points = 15;
    label = "High-value item";
  } else if (fairMarketPrice > 150) {
    points = 12;
    label = "Solid-value item";
  } else if (fairMarketPrice > 75) {
    points = 9;
    label = "Mid-value item";
  } else {
    points = 6;
    label = "Modest-value item";
  }

  return { points, reason: `${label} at $${fairMarketPrice} (+${points})` };
}

// ---------------------------------------------------------------------------
// Factor 4: Size/Weight Burden (0-10 pts)
// ---------------------------------------------------------------------------

function scoreSizeBurden(
  sizeClass: string | undefined,
  weightLbs: number | undefined,
): { points: number; reason: string } {
  const sizePoints: Record<string, number> = {
    OVERSIZED: 10,
    LARGE: 7,
    MEDIUM: 4,
    SMALL: 2,
  };

  let points = sizeClass ? (sizePoints[sizeClass] ?? 3) : 3;
  const sizeLabel = sizeClass ?? "unknown-size";

  let reason = `${sizeLabel} item`;

  if (weightLbs !== undefined && weightLbs > 50) {
    const before = points;
    points = Math.min(points + 3, 10);
    const bonus = points - before;
    reason += ` weighing ${weightLbs} lbs — heavy item penalty`;
    if (bonus > 0) reason += ` (+${bonus} weight bonus)`;
  }

  reason += ` (+${points})`;
  return { points, reason };
}

// ---------------------------------------------------------------------------
// Factor 5: User Goal Alignment (0-10 pts)
// ---------------------------------------------------------------------------

function scoreUserGoal(goal: string | undefined): { points: number; reason: string } {
  const goalPoints: Record<string, { points: number; label: string }> = {
    MAXIMIZE_CASH: { points: 5, label: "Goal: maximize cash — patient approach" },
    REDUCE_STRESS: { points: 8, label: "Goal: reduce stress — wants it done" },
    REDUCE_SHIPMENT_BURDEN: { points: 9, label: "Goal: reduce shipment burden — shed weight fast" },
    FIT_SMALLER_HOME: { points: 7, label: "Goal: fit smaller home — size-driven" },
    BALANCED: { points: 6, label: "Goal: balanced approach" },
  };

  const match = goal ? goalPoints[goal] : undefined;
  const points = match?.points ?? 5;
  const label = match?.label ?? "No specific goal set";

  return { points, reason: `${label} (+${points})` };
}

// ---------------------------------------------------------------------------
// Factor 6: Confidence Modifier (0-5 pts)
// ---------------------------------------------------------------------------

function scoreConfidence(confidenceScore: number): { points: number; reason: string } {
  let points: number;
  let label: string;

  if (confidenceScore >= 0.7) {
    points = 5;
    label = "High pricing confidence";
  } else if (confidenceScore >= 0.4) {
    points = 3;
    label = "Moderate pricing confidence";
  } else {
    points = 1;
    label = "Low pricing confidence";
  }

  return { points, reason: `${label} (${(confidenceScore * 100).toFixed(0)}%) (+${points})` };
}

// ---------------------------------------------------------------------------
// Bucket Assignment
// ---------------------------------------------------------------------------

function assignBucket(
  score: number,
  effectiveDeadline: number | null,
  fairMarketPrice: number | null,
  marketHealth: MarketHealthLevel,
): UrgencyBucket {
  // Special: not-worth-selling overrides
  if (fairMarketPrice !== null && fairMarketPrice <= 10) {
    return "NOT_WORTH_SELLING";
  }
  if (fairMarketPrice !== null && fairMarketPrice <= 25 && marketHealth === "insufficient") {
    return "NOT_WORTH_SELLING";
  }

  let bucket: UrgencyBucket;

  if (score >= 75 || (effectiveDeadline !== null && effectiveDeadline <= 7)) {
    bucket = "SELL_IMMEDIATELY";
  } else if (score >= 55 || (effectiveDeadline !== null && effectiveDeadline >= 8 && effectiveDeadline <= 14)) {
    bucket = "SELL_THIS_WEEK";
  } else if (score >= 35) {
    bucket = "SELL_SOON";
  } else if (score >= 20) {
    bucket = "PLAN_TO_SELL";
  } else {
    bucket = "LOW_URGENCY";
  }

  // If no PCS date provided, cap bucket at PLAN_TO_SELL
  if (effectiveDeadline === null) {
    const urgencyOrder: UrgencyBucket[] = [
      "SELL_IMMEDIATELY",
      "SELL_THIS_WEEK",
      "SELL_SOON",
      "PLAN_TO_SELL",
      "LOW_URGENCY",
      "NOT_WORTH_SELLING",
    ];
    const bucketIdx = urgencyOrder.indexOf(bucket);
    const capIdx = urgencyOrder.indexOf("PLAN_TO_SELL");
    if (bucketIdx < capIdx) {
      bucket = "PLAN_TO_SELL";
    }
  }

  return bucket;
}

// ---------------------------------------------------------------------------
// Recommended Price Tier
// ---------------------------------------------------------------------------

function recommendPriceTier(
  effectiveDeadline: number | null,
  marketHealth: MarketHealthLevel,
): "fastSale" | "fairMarket" | "maxReach" {
  if (effectiveDeadline === null) return "fairMarket";
  if (effectiveDeadline <= 10) return "fastSale";
  if (effectiveDeadline <= 21 || marketHealth === "weak") return "fairMarket";
  return "maxReach";
}

// ---------------------------------------------------------------------------
// Factor 7: Origin Pressure (0-5 pts)
// Remote origins increase urgency for bulky items and reduce effective deadline
// ---------------------------------------------------------------------------

interface OriginScoreConfig {
  bulkyBonus: number;    // extra points for LARGE/OVERSIZED
  nonBulkyBonus: number; // extra points for smaller items
  deadlineShiftDays: number; // reduce effective deadline by this many days
  label: string;
}

const ORIGIN_SCORE_CONFIG: Record<string, OriginScoreConfig> = {
  guam:    { bulkyBonus: 5, nonBulkyBonus: 2, deadlineShiftDays: 14, label: "Guam origin — limited local market" },
  hawaii:  { bulkyBonus: 3, nonBulkyBonus: 1, deadlineShiftDays: 7, label: "Hawaii — island shipping adds pressure" },
  alaska:  { bulkyBonus: 3, nonBulkyBonus: 1, deadlineShiftDays: 7, label: "Alaska — remote location increases urgency" },
  oconus:  { bulkyBonus: 2, nonBulkyBonus: 1, deadlineShiftDays: 7, label: "OCONUS — limited selling options" },
};

function scoreOriginPressure(
  region: string | undefined,
  sizeClass: string | undefined,
): { points: number; deadlineShift: number; reason: string } {
  if (!region || region === "conus") {
    return { points: 0, deadlineShift: 0, reason: "CONUS origin — no regional adjustment (+0)" };
  }

  const config = ORIGIN_SCORE_CONFIG[region];
  if (!config) {
    return { points: 0, deadlineShift: 0, reason: `Unknown region "${region}" — no adjustment (+0)` };
  }

  const isBulky = sizeClass === "LARGE" || sizeClass === "OVERSIZED";
  const points = isBulky ? config.bulkyBonus : config.nonBulkyBonus;
  const sizeLabel = isBulky ? "bulky item" : "standard-size item";

  return {
    points,
    deadlineShift: config.deadlineShiftDays,
    reason: `${config.label}, ${sizeLabel} (+${points})`,
  };
}

// ---------------------------------------------------------------------------
// Main: computeUrgencyScore
// ---------------------------------------------------------------------------

export function computeUrgencyScore(input: UrgencyInput): UrgencyOutput {
  const reasoning: string[] = [];

  // Factor 1: Time Pressure (40 pts)
  const time = scoreTimePressure(input.daysUntilPCS, input.daysUntilPackout);
  reasoning.push(time.reason);

  // Factor 2: Market Liquidity (20 pts)
  const market = scoreMarketLiquidity(input.marketHealth);
  reasoning.push(market.reason);

  // Factor 3: Value Signal (15 pts)
  const value = scoreValueSignal(input.fairMarketPrice);
  reasoning.push(value.reason);

  // Factor 4: Size/Weight Burden (10 pts)
  const size = scoreSizeBurden(input.sizeClass, input.weightLbs);
  reasoning.push(size.reason);

  // Factor 5: User Goal Alignment (10 pts)
  const goal = scoreUserGoal(input.userGoal);
  reasoning.push(goal.reason);

  // Factor 6: Confidence Modifier (5 pts)
  const confidence = scoreConfidence(input.confidenceScore);
  reasoning.push(confidence.reason);

  // Factor 7: Origin Pressure (0-5 pts)
  const origin = scoreOriginPressure(input.region, input.sizeClass);
  if (origin.points > 0) reasoning.push(origin.reason);

  // Sum raw score (max 100)
  const score = Math.min(
    time.points + market.points + value.points + size.points + goal.points + confidence.points + origin.points,
    100,
  );

  // Adjust effective deadline for remote origins (tighter window)
  const adjustedDeadline = time.effectiveDeadline !== null
    ? Math.max(0, time.effectiveDeadline - origin.deadlineShift)
    : null;

  // Bucket assignment (uses adjusted deadline for remote origins)
  const bucket = assignBucket(score, adjustedDeadline, input.fairMarketPrice, input.marketHealth);

  // Recommended price tier (uses adjusted deadline)
  const recommendedPriceTier = recommendPriceTier(adjustedDeadline, input.marketHealth);

  return {
    bucket,
    score,
    reasoning,
    recommendedPriceTier,
    adjustedDeadline,
  };
}

// ---------------------------------------------------------------------------
// Sale Speed Estimator
// ---------------------------------------------------------------------------

export function estimateSaleSpeed(
  marketHealth: MarketHealthLevel,
  priceSpreadRatio: number,
): SaleSpeedEstimate {
  if (marketHealth === "insufficient") {
    return { band: "uncertain", estimatedDays: "unknown" };
  }

  if (marketHealth === "weak") {
    return { band: "slow", estimatedDays: "10-21 days" };
  }

  if (marketHealth === "moderate") {
    return { band: "moderate", estimatedDays: "5-10 days" };
  }

  // marketHealth === "strong"
  if (priceSpreadRatio < 0.3) {
    return { band: "fast", estimatedDays: "1-3 days" };
  }

  return { band: "moderate", estimatedDays: "3-7 days" };
}
