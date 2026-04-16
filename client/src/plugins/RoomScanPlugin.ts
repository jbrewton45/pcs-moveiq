import { registerPlugin, Capacitor } from "@capacitor/core";
import type {
  RoomScanData,
  ScannedWall,
  ScannedOpening,
  ScannedObject,
  FloorPoint,
} from "../types";

// Re-export so existing imports from this module keep working.
export type {
  RoomScanData,
  ScannedWall,
  ScannedOpening,
  ScannedObject,
  FloorPoint,
};

/** Historical alias — the plugin emits a full RoomScanData payload. */
export type RoomScanResult = RoomScanData;

// ─────────────────────────────────────────────────────────────────────────────
//  Plugin interface
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomScanPluginDefinition {
  /** Launch the native RoomPlan scanning UI. Resolves with the scan on Done. */
  startScan(): Promise<RoomScanResult>;
  /** Programmatically stop a running scan session. */
  stopScan(): Promise<void>;
  /** Returns whether the current device has LiDAR + iOS 16+. */
  checkSupport(): Promise<{ supported: boolean }>;
  /** Phase 15: open a USDZ file in native iOS Quick Look (supports AR). */
  previewUSDZ(options: { path: string }): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Web fallback (browser / Android — no LiDAR)
// ─────────────────────────────────────────────────────────────────────────────

class RoomScanPluginWeb implements RoomScanPluginDefinition {
  startScan(): Promise<RoomScanResult> {
    return Promise.reject(
      new Error("LiDAR room scanning is only available in the iOS native app on a LiDAR-equipped iPhone Pro / iPad Pro.")
    );
  }

  stopScan(): Promise<void> {
    return Promise.resolve();
  }

  checkSupport(): Promise<{ supported: boolean }> {
    return Promise.resolve({ supported: false });
  }

  previewUSDZ(_: { path: string }): Promise<void> {
    return Promise.reject(new Error("3D preview is only available in the iOS native app."));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Register — Capacitor routes calls to the Swift plugin on iOS,
//  and falls back to RoomScanPluginWeb on other platforms.
// ─────────────────────────────────────────────────────────────────────────────

console.log(
  `[RoomScanPlugin] module load — platform=${Capacitor.getPlatform()} native=${Capacitor.isNativePlatform()}`
);

const nativePlugin = registerPlugin<RoomScanPluginDefinition>("RoomScanPlugin", {
  web: () => new RoomScanPluginWeb(),
});

// Diagnostic proxy — logs every call + caught error verbatim so the root
// cause of an UNIMPLEMENTED or similar Capacitor error is visible in the
// Xcode / Safari Web Inspector console instead of just bubbling a string.
export const RoomScanPlugin: RoomScanPluginDefinition = {
  async startScan() {
    console.log("[RoomScanPlugin] → startScan()");
    try {
      const res = await nativePlugin.startScan();
      console.log(
        `[RoomScanPlugin] ← startScan ok — walls=${res.wallCount} doors=${res.doorCount} windows=${res.windowCount} objects=${res.objects?.length ?? 0} areaSqM=${res.areaSqM?.toFixed?.(2) ?? res.areaSqM} source=${res.areaSource} closed=${res.polygonClosed}`
      );
      return res;
    } catch (err) {
      console.error("[RoomScanPlugin] ✗ startScan error", err);
      throw err;
    }
  },
  async stopScan() {
    console.log("[RoomScanPlugin] → stopScan()");
    try {
      await nativePlugin.stopScan();
      console.log("[RoomScanPlugin] ← stopScan ok");
    } catch (err) {
      console.error("[RoomScanPlugin] ✗ stopScan error", err);
      throw err;
    }
  },
  async checkSupport() {
    console.log("[RoomScanPlugin] → checkSupport()");
    try {
      const res = await nativePlugin.checkSupport();
      console.log("[RoomScanPlugin] ← checkSupport ok", res);
      return res;
    } catch (err) {
      console.error("[RoomScanPlugin] ✗ checkSupport error", err);
      throw err;
    }
  },
  async previewUSDZ(options) {
    console.log(`[RoomScanPlugin] → previewUSDZ(${options?.path})`);
    try {
      await nativePlugin.previewUSDZ(options);
      console.log("[RoomScanPlugin] ← previewUSDZ ok");
    } catch (err) {
      console.error("[RoomScanPlugin] ✗ previewUSDZ error", err);
      throw err;
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert square metres to square feet (rounded to the nearest foot). */
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

/** Human-readable confidence label (accepts numeric 0/1/2). */
export function confidenceLabel(value: number): string {
  return value >= 2 ? "High" : value >= 1 ? "Medium" : "Low";
}
