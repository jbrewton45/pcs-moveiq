import { useState } from "react";
import { useAppUpdate } from "../hooks/useAppUpdate";

/**
 * Update banner between topbar and content. Android-only.
 * Handles: sign-in prompt, update available, download progress, errors.
 */
export function UpdateBanner() {
  const {
    status, isAndroid, testerSignedIn, newVersionName, releaseNotes,
    downloadPercent, installUpdate, checkForUpdate, signIn, dismiss, error,
  } = useAppUpdate();
  const [showNotes, setShowNotes] = useState(false);

  if (!isAndroid) return null;

  // Tester needs to sign in first (first launch only)
  if (!testerSignedIn && status !== "dismissed" && status !== "checking") {
    return (
      <div className="update-banner update-banner--available">
        <span className="update-banner__text">Sign in to receive test builds</span>
        <div className="update-banner__actions">
          <button className="update-banner__btn" onClick={signIn} disabled={status === "signing_in"}>
            {status === "signing_in" ? "Signing In..." : "Sign In"}
          </button>
          {status === "error" && (
            <button className="update-banner__btn update-banner__btn--ghost" onClick={checkForUpdate}>
              Retry Check
            </button>
          )}
          <button className="update-banner__dismiss" onClick={dismiss}>&times;</button>
        </div>
        {status === "error" && error && <p className="update-banner__error">{error}</p>}
      </div>
    );
  }

  if (status === "idle" || status === "signing_in" || status === "checking" || status === "up_to_date" || status === "dismissed") {
    return null;
  }

  if (status === "available") {
    return (
      <div className="update-banner update-banner--available">
        <div className="update-banner__content">
          <span className="update-banner__text">
            Update available{newVersionName ? ` (v${newVersionName})` : ""}
          </span>
          {releaseNotes && (
            <button className="update-banner__notes-toggle" onClick={() => setShowNotes(v => !v)}>
              {showNotes ? "Hide" : "What's new?"}
            </button>
          )}
        </div>
        <div className="update-banner__actions">
          <button className="update-banner__btn" onClick={installUpdate}>Install</button>
          <button className="update-banner__dismiss" onClick={dismiss}>&times;</button>
        </div>
        {showNotes && releaseNotes && (
          <p className="update-banner__release-notes">{releaseNotes}</p>
        )}
      </div>
    );
  }

  if (status === "downloading") {
    return (
      <div className="update-banner update-banner--updating">
        <span className="update-banner__text">
          Downloading update{downloadPercent != null ? ` (${downloadPercent}%)` : "..."}
        </span>
        {downloadPercent != null && (
          <div className="update-banner__progress">
            <div className="update-banner__progress-fill" style={{ width: `${downloadPercent}%` }} />
          </div>
        )}
      </div>
    );
  }

  if (status === "updating") {
    return (
      <div className="update-banner update-banner--updating">
        <span className="update-banner__text">Installing update...</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="update-banner update-banner--error">
        <span className="update-banner__text">Update check failed</span>
        <div className="update-banner__actions">
          <button className="update-banner__btn" onClick={checkForUpdate}>Retry</button>
          <button className="update-banner__dismiss" onClick={dismiss}>&times;</button>
        </div>
      </div>
    );
  }

  return null;
}
