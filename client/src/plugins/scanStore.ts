/**
 * scanStore.ts
 * Local persistence for room scan data.
 *
 * Scan results from the LiDAR plugin are saved here so they survive app
 * restarts without requiring backend schema changes. The store is keyed by
 * roomId and saved to localStorage under "moveiq_scan_data".
 *
 * When the backend adds a scanData column to the rooms table this store can
 * be replaced by a straightforward api.updateRoom() call.
 */

import type { RoomScanData } from "../types";

const STORAGE_KEY = "moveiq_scan_data";

type ScanStore = Record<string, RoomScanData>;

function load(): ScanStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScanStore) : {};
  } catch {
    return {};
  }
}

function save(store: ScanStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage quota exceeded or private browsing — fail silently
  }
}

/** Save scan result for a room. */
export function saveScan(roomId: string, data: RoomScanData): void {
  const store = load();
  store[roomId] = data;
  save(store);
}

/** Retrieve scan result for a room, or undefined if never scanned. */
export function getScan(roomId: string): RoomScanData | undefined {
  return load()[roomId];
}

/** Remove scan data for a room. */
export function clearScan(roomId: string): void {
  const store = load();
  delete store[roomId];
  save(store);
}

/** Return all stored scans as a Record<roomId, RoomScanData>. */
export function getAllScans(): ScanStore {
  return load();
}
