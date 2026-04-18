/**
 * scanStore.ts — localStorage scan cache with metadata.
 *
 * Architecture rules:
 * - Server DB is the single source of truth for room scans.
 * - localStorage is a read-fallback cache, not independent state.
 * - Entries carry metadata: cachedAt, syncedToServer, cacheVersion.
 * - Namespaced per user to prevent data leakage on shared devices.
 * - Unsynced offline scans are never overwritten by server reads.
 */

import type { RoomScanData } from "../types";

const CACHE_VERSION = 1;
const USER_ID_KEY = "moveiq_user_id";

export interface CachedScan {
  cachedAt: string;
  syncedToServer: boolean;
  cacheVersion: number;
  data: RoomScanData;
}

type ScanStore = Record<string, CachedScan>;

function getStorageKey(): string {
  const userId = localStorage.getItem(USER_ID_KEY) ?? "anonymous";
  return `moveiq_scan_v${CACHE_VERSION}_${userId}`;
}

function load(): ScanStore {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ScanStore;
    // Discard entries with mismatched cache version
    const valid: ScanStore = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.cacheVersion === CACHE_VERSION) valid[k] = v;
    }
    return valid;
  } catch {
    return {};
  }
}

function persist(store: ScanStore): void {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(store));
  } catch (err) {
    console.warn("[scanStore] localStorage write failed (quota?):", err instanceof Error ? err.message : err);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Save scan data after a successful server PUT. */
export function saveSynced(roomId: string, data: RoomScanData): void {
  const store = load();
  store[roomId] = {
    cachedAt: new Date().toISOString(),
    syncedToServer: true,
    cacheVersion: CACHE_VERSION,
    data,
  };
  persist(store);
  console.log(`[scanStore] synced ${roomId} (server-backed)`);
}

/** Save scan data when the server PUT failed (offline fallback). */
export function saveUnsynced(roomId: string, data: RoomScanData): void {
  const store = load();
  store[roomId] = {
    cachedAt: new Date().toISOString(),
    syncedToServer: false,
    cacheVersion: CACHE_VERSION,
    data,
  };
  persist(store);
  console.log(`[scanStore] saved unsynced ${roomId} (offline fallback)`);
}

/** Get the cached scan entry for a room, if any. */
export function getCached(roomId: string): CachedScan | undefined {
  return load()[roomId];
}

/** Get just the scan data (convenience for rendering). */
export function getScanData(roomId: string): RoomScanData | undefined {
  return getCached(roomId)?.data;
}

/** Check if a room has an unsynced local scan that shouldn't be overwritten. */
export function hasUnsyncedScan(roomId: string): boolean {
  const entry = getCached(roomId);
  return !!entry && !entry.syncedToServer;
}

/**
 * Clear a room's cache entry.
 * Called when server authoritatively says no scan exists (404)
 * and the local entry was previously synced (not an offline write).
 */
export function clearIfSynced(roomId: string): void {
  const entry = getCached(roomId);
  if (!entry) return;
  if (!entry.syncedToServer) {
    console.log(`[scanStore] KEPT unsynced ${roomId} — server returned 404 but local has unsynced scan`);
    return;
  }
  const store = load();
  delete store[roomId];
  persist(store);
  console.log(`[scanStore] cleared synced ${roomId} — server confirmed no scan`);
}

/** Clear all scan data for the current user. Call on logout. */
export function clearAll(): void {
  try {
    localStorage.removeItem(getStorageKey());
  } catch { /* ignore */ }
  console.log("[scanStore] cleared all for current user");
}

/** Store the current user's ID for namespace isolation. */
export function setUserId(userId: string): void {
  localStorage.setItem(USER_ID_KEY, userId);
}

/** Clear user ID (call on logout alongside clearAll). */
export function clearUserId(): void {
  localStorage.removeItem(USER_ID_KEY);
}

// ── Legacy compat (used by old callers, maps to new API) ────────────────────

/** @deprecated Use saveSynced or saveUnsynced. */
export function saveScan(roomId: string, data: RoomScanData): void {
  saveSynced(roomId, data);
}

/** @deprecated Use getScanData. */
export function getScan(roomId: string): RoomScanData | undefined {
  return getScanData(roomId);
}

/** @deprecated Use clearIfSynced. */
export function clearScan(roomId: string): void {
  const store = load();
  delete store[roomId];
  persist(store);
}
