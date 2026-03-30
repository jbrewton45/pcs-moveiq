import { useState } from "react";
import { useAppUpdate } from "../hooks/useAppUpdate";

/**
 * Slim update banner between topbar and content.
 * Android-only — renders nothing on web/iOS.
 */
export function UpdateBanner() {
  const { status, isAndroid, newVersionName, releaseNotes, installUpdate, checkForUpdate, dismiss } = useAppUpdate();
  const [showNotes, setShowNotes] = useState(false);

  if (!isAndroid) return null;
  if (status === "idle" || status === "checking" || status === "up_to_date" || status === "dismissed") return null;

  if (status === "available") {
    return (
      <div className="update-banner update-banner--available">
        <div className="update-banner__content">
          <span className="update-banner__text">
            Update available{newVersionName ? ` (v${newVersionName})` : ""}
          </span>
          {releaseNotes && (
            <button className="update-banner__notes-toggle" onClick={() => setShowNotes(v => !v)}>
              {showNotes ? "Hide notes" : "What's new?"}
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
