import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

// ---------------------------------------------------------------------------
// Native bridge types
// ---------------------------------------------------------------------------

interface AppUpdateCheckResult {
  available: boolean;
  versionName?: string;
  versionCode?: number;
  releaseNotes?: string;
  error?: string;
}

interface SignInResult {
  signedIn: boolean;
  error?: string;
}

interface AppInfoResult {
  versionName: string;
  versionCode: number;
  appId: string;
  testerSignedIn: boolean;
}

interface UpdateProgressEvent {
  status: string;
  bytesTotal: number;
  bytesDownloaded: number;
  percent?: number;
}

interface AppUpdatePluginInterface {
  signIn(): Promise<SignInResult>;
  checkForUpdate(): Promise<AppUpdateCheckResult>;
  updateApp(): Promise<void>;
  getAppInfo(): Promise<AppInfoResult>;
  addListener(event: "updateProgress", handler: (data: UpdateProgressEvent) => void): Promise<PluginListenerHandle>;
}

const AppUpdate = registerPlugin<AppUpdatePluginInterface>("AppUpdate");

const CHECK_COOLDOWN_MS = 60_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type UpdateStatus =
  | "idle"
  | "signing_in"
  | "checking"
  | "available"
  | "up_to_date"
  | "downloading"
  | "updating"
  | "error"
  | "dismissed";

export interface AppUpdateState {
  status: UpdateStatus;
  isAndroid: boolean;
  testerSignedIn: boolean;
  versionName: string | null;
  versionCode: number | null;
  newVersionName: string | null;
  releaseNotes: string | null;
  downloadPercent: number | null;
  error: string | null;
  signIn: () => void;
  checkForUpdate: () => void;
  installUpdate: () => void;
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const isAndroid = Capacitor.getPlatform() === "android";

  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [testerSignedIn, setTesterSignedIn] = useState(false);
  const [versionName, setVersionName] = useState<string | null>(null);
  const [versionCode, setVersionCode] = useState<number | null>(null);
  const [newVersionName, setNewVersionName] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastCheckRef = useRef<number>(0);
  const checkingRef = useRef(false);

  // Load app info + sign-in status on mount
  useEffect(() => {
    if (!isAndroid) return;
    AppUpdate.getAppInfo()
      .then((info) => {
        setVersionName(info.versionName);
        setVersionCode(info.versionCode);
        setTesterSignedIn(info.testerSignedIn);
      })
      .catch(() => {});
  }, [isAndroid]);

  // Listen for download progress events from native
  useEffect(() => {
    if (!isAndroid) return;
    let handle: PluginListenerHandle | null = null;
    AppUpdate.addListener("updateProgress", (event) => {
      setDownloadPercent(event.percent ?? null);
      if (event.status === "DOWNLOADED" || event.status === "INSTALL_CONFIRMED") {
        setStatus("updating");
      }
    }).then(h => { handle = h; });
    return () => { handle?.remove(); };
  }, [isAndroid]);

  const doSignIn = useCallback(async () => {
    if (!isAndroid) return;
    setStatus("signing_in");
    try {
      const result = await AppUpdate.signIn();
      setTesterSignedIn(result.signedIn);
      if (result.signedIn) {
        setStatus("idle");
      } else {
        setStatus("error");
        setError(result.error ?? "Sign-in cancelled");
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  }, [isAndroid]);

  const doCheck = useCallback(async (force = false) => {
    if (!isAndroid) return;
    if (checkingRef.current) return;

    const now = Date.now();
    if (!force && now - lastCheckRef.current < CHECK_COOLDOWN_MS) return;

    checkingRef.current = true;
    setStatus("checking");
    setError(null);

    try {
      // checkForUpdate auto-signs-in on the native side if needed
      const result = await AppUpdate.checkForUpdate();
      lastCheckRef.current = Date.now();

      if (result.error?.includes("sign-in")) {
        setTesterSignedIn(false);
      }

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

  // Auto-check on mount (3s delay)
  useEffect(() => {
    if (!isAndroid) return;
    const timer = setTimeout(() => { void doCheck(); }, 3000);
    return () => clearTimeout(timer);
  }, [isAndroid, doCheck]);

  // Re-check on app resume
  useEffect(() => {
    if (!isAndroid) return;
    function handleVisibility() {
      if (document.visibilityState === "visible") void doCheck();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isAndroid, doCheck]);

  const installUpdate = useCallback(async () => {
    if (!isAndroid) return;
    setStatus("downloading");
    setDownloadPercent(0);
    try {
      await AppUpdate.updateApp();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }, [isAndroid]);

  const dismiss = useCallback(() => setStatus("dismissed"), []);

  return {
    status,
    isAndroid,
    testerSignedIn,
    versionName,
    versionCode,
    newVersionName,
    releaseNotes,
    downloadPercent,
    error,
    signIn: doSignIn,
    checkForUpdate: () => { void doCheck(true); },
    installUpdate,
    dismiss,
  };
}
