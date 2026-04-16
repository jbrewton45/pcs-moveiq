import type { Request, Response } from "express";
import { getProjectById } from "../services/projects.service.js";
import { getPriceCalibration, type CalibrationConfidence } from "../services/decisions.service.js";

export interface CategoryCalibration {
  category: string;
  multiplier: number;
  sampleSize: number;
  variance: number;
  confidence: CalibrationConfidence;
}

/**
 * GET /api/calibration?projectId=...
 * Returns one row per category that has ≥ MIN_SAMPLES_FOR_CALIBRATION sold
 * items with pricing. Sorted by sampleSize desc so the most-evidence-heavy
 * entries bubble to the top. Empty array when the project has no qualifying
 * categories yet (projects the user hasn't sold anything in).
 */
export async function getCalibrationHandler(req: Request, res: Response) {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "projectId is required" });
  if (!(await getProjectById(projectId))) return res.status(404).json({ error: "Project not found" });

  const cal = await getPriceCalibration(projectId);

  const rows: CategoryCalibration[] = [];
  for (const [category, entry] of cal) {
    rows.push({
      category,
      multiplier: entry.multiplier,
      sampleSize: entry.sampleSize,
      variance: entry.variance,
      confidence: entry.confidence,
    });
  }
  rows.sort((a, b) => b.sampleSize - a.sampleSize || a.category.localeCompare(b.category));
  return res.status(200).json(rows);
}
