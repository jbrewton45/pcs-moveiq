import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

// ---------------------------------------------------------------------------
// Type-safe bridge to the native AppUpdatePlugin (Android only)
// ---------------------------------------------------------------------------

interface AppUpdateCheckResult {
  available: boolean;
  versionName?: string;
  versionCode?: number;
  releaseNotes?: string;
  error?: string;
}

interface AppInfoResult {
  versionName: string;
  versionCode: number;
  appId: string;
}

interface AppUpdatePluginInterface {
  checkForUpdate(): Promise<AppUpdateCheckResult>;
  updateApp(): Promise<void>;
  getAppInfo(): Promise<AppInfoResult>;
}

const AppUpdate = registerPlugin<AppUpdatePluginInterface>("AppUpdate");

// Minimum seconds between automatic update checks (prevents resume spam)
const CHECK_COOLDOWN_MS = 60_000;

// ---------------------------------------------------------------------------
// Hook: useAppUpdate
// ---------------------------------------------------------------------------

export type UpdateStatus = "idle" | "checking" | "available" | "up_to_date" | "updating" | "error" | "dismissed";

export interface AppUpdateState {
  status: UpdateStatus;
  isAndroid: boolean;
  versionName: string | null;
  versionCode: number | null;
  newVersionName: string | null;
  releaseNotes: string | null;
  error: string | null;
  checkForUpdate: () => void;
  installUpdate: () => void;
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const isAndroid = Capacitor.getPlatform() === "android";

  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [versionName, setVersionName] = useState<string | null>(null);
  const [versionCode, setVersionCode] = useState<number | null>(null);
  const [newVersionName, setNewVersionName] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastCheckRef = useRef<number>(0);
  const checkingRef = useRef(false);

  // Load current app version on mount
  useEffect(() => {
    if (!isAndroid) return;
    AppUpdate.getAppInfo()
      .then((info) => {
        setVersionName(info.versionName);
        setVersionCode(info.versionCode);
      })
      .catch(() => { /* version info is nice-to-have */ });
  }, [isAndroid]);

  const doCheck = useCallback(async (force = false) => {
    if (!isAndroid) return;
    if (checkingRef.current) return; // already in-flight

    // Cooldown: skip if checked recently (unless forced by user)
    const now = Date.now();
    if (!force && now - lastCheckRef.current < CHECK_COOLDOWN_MS) return;

    checkingRef.current = true;
    setStatus("checking");
    setError(null);

    try {
      const result = await AppUpdate.checkForUpdate();
      lastCheckRef.current = Date.now();

      if (result.available) {
        setStatus("available");
        setNewVersionName(result.versionName ?? null);
        setReleaseNotes(result.releaseNotes ?? null);
      } else {
        setStatus(result.error ? "error" : "up_to_date");
        if (result.error) setError(result.error);
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Update check failed");
    } finally {
      checkingRef.current = false;
    }
  }, [isAndroid]);

  // Auto-check on mount (3s delay to let app settle)
  useEffect(() => {
    if (!isAndroid) return;
    const timer = setTimeout(() => { void doCheck(); }, 3000);
    return () => clearTimeout(timer);
  }, [isAndroid, doCheck]);

  // Re-check when app resumes from background
  useEffect(() => {
    if (!isAndroid) return;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void doCheck(); // cooldown prevents spam
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isAndroid, doCheck]);

  const installUpdate = useCallback(async () => {
    if (!isAndroid) return;
    setStatus("updating");
    try {
      await AppUpdate.updateApp();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }, [isAndroid]);

  const dismiss = useCallback(() => {
    setStatus("dismissed");
  }, []);

  return {
    status,
    isAndroid,
    versionName,
    versionCode,
    newVersionName,
    releaseNotes,
    error,
    checkForUpdate: () => { void doCheck(true); }, // forced — bypasses cooldown
    installUpdate,
    dismiss,
  };
}
