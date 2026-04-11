import { registerPlugin } from "@capacitor/core";

// ─────────────────────────────────────────────────────────────────────────────
//  Types returned from the native RoomPlan scan
// ─────────────────────────────────────────────────────────────────────────────

export interface FloorPoint {
  /** Metres along the X axis */
  x: number;
  /** Metres along the Z axis (depth) */
  z: number;
}

export interface ScannedWall {
  widthM: number;
  heightM: number;
  /** 0 = low, 1 = medium, 2 = high */
  confidence: number;
}

export interface ScannedOpening {
  widthM: number;
  heightM: number;
  confidence: number;
}

export interface ScannedObject {
  /** RoomPlan category label e.g. "sofa", "television", "bed" */
  label: string;
  widthM: number;
  heightM: number;
  depthM: number;
  confidence: number;
}

export interface RoomScanResult {
  /** Overall bounding-box width in metres */
  widthM: number;
  /** Overall bounding-box length (depth) in metres */
  lengthM: number;
  /** Approximate floor area in square metres */
  areaSqM: number;
  /** 2-D floor polygon points (metres) */
  floorPolygon: FloorPoint[];
  walls: ScannedWall[];
  doors: ScannedOpening[];
  windows: ScannedOpening[];
  objects: ScannedObject[];
  wallCount: number;
  doorCount: number;
  windowCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Plugin interface
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomScanPluginDefinition {
  /**
   * Launch the RoomPlan scanning UI.
   * Resolves with scan results when the user taps "Done".
   * Rejects if the device doesn't support LiDAR or the user cancels.
   */
  startScan(): Promise<RoomScanResult>;

  /** Programmatically stop a running scan session. */
  stopScan(): Promise<void>;

  /** Returns whether the current device has a LiDAR sensor (iPhone 12 Pro+). */
  checkSupport(): Promise<{ supported: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Web fallback (browser / Android — no LiDAR)
// ─────────────────────────────────────────────────────────────────────────────

class RoomScanPluginWeb implements RoomScanPluginDefinition {
  startScan(): Promise<RoomScanResult> {
    return Promise.reject(
      new Error(
        "LiDAR room scanning is only available on iPhone 12 Pro or later with the iOS native app."
      )
    );
  }

  stopScan(): Promise<void> {
    return Promise.resolve();
  }

  checkSupport(): Promise<{ supported: boolean }> {
    return Promise.resolve({ supported: false });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Register — Capacitor routes calls to the Swift plugin on iOS,
//  and falls back to RoomScanPluginWeb on other platforms.
// ─────────────────────────────────────────────────────────────────────────────

export const RoomScanPlugin = registerPlugin<RoomScanPluginDefinition>(
  "RoomScanPlugin",
  { web: () => new RoomScanPluginWeb() }
);

// ─────────────────────────────────────────────────────────────────────────────
//  Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert square metres to square feet */
export function sqMToSqFt(sqM: number): number {
  return Math.round(sqM * 10.764);
}

/** Convert metres to feet-and-inches string e.g. "12' 4\"" */
export function mToFtIn(m: number): string {
  const totalInches = m * 39.3701;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}' ${inches}"`;
}

/** Human-readable confidence label */
export function confidenceLabel(value: number): string {
  return value >= 2 ? "High" : value >= 1 ? "Medium" : "Low";
}
