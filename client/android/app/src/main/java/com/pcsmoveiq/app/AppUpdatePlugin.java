package com.pcsmoveiq.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.firebase.appdistribution.FirebaseAppDistribution;

/**
 * Capacitor plugin bridging Firebase App Distribution to the web layer.
 *
 * Flow: signIn → checkForUpdate → updateApp
 *
 * Firebase App Distribution requires the tester to be signed in before
 * checkForNewRelease() returns results. This plugin handles sign-in
 * automatically when checking for updates.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String TAG = "AppUpdatePlugin";

    /**
     * Sign in the tester. Firebase shows its own sign-in UI on first use.
     * Subsequent calls are no-ops if already signed in.
     */
    @PluginMethod()
    public void signIn(PluginCall call) {
        try {
            FirebaseAppDistribution fad = FirebaseAppDistribution.getInstance();
            if (fad.isTesterSignedIn()) {
                JSObject result = new JSObject();
                result.put("signedIn", true);
                call.resolve(result);
                return;
            }

            fad.signInTester().addOnSuccessListener(aVoid -> {
                JSObject result = new JSObject();
                result.put("signedIn", true);
                call.resolve(result);
            }).addOnFailureListener(e -> {
                Log.w(TAG, "Tester sign-in failed", e);
                JSObject result = new JSObject();
                result.put("signedIn", false);
                result.put("error", e.getMessage());
                call.resolve(result);
            });
        } catch (Exception e) {
            Log.w(TAG, "Firebase App Distribution not available", e);
            JSObject result = new JSObject();
            result.put("signedIn", false);
            result.put("error", "Firebase App Distribution not available");
            call.resolve(result);
        }
    }

    /**
     * Check for a new release. Auto-signs-in the tester first if needed.
     * Returns: { available, versionName?, versionCode?, releaseNotes?, error? }
     */
    @PluginMethod()
    public void checkForUpdate(PluginCall call) {
        try {
            FirebaseAppDistribution fad = FirebaseAppDistribution.getInstance();

            // Ensure tester is signed in before checking
            if (!fad.isTesterSignedIn()) {
                fad.signInTester().addOnSuccessListener(aVoid -> {
                    doCheckForNewRelease(fad, call);
                }).addOnFailureListener(e -> {
                    Log.w(TAG, "Auto sign-in failed during update check", e);
                    JSObject result = new JSObject();
                    result.put("available", false);
                    result.put("error", "Tester sign-in required: " + e.getMessage());
                    call.resolve(result);
                });
            } else {
                doCheckForNewRelease(fad, call);
            }
        } catch (Exception e) {
            Log.w(TAG, "Firebase App Distribution not available", e);
            JSObject result = new JSObject();
            result.put("available", false);
            result.put("error", "Firebase App Distribution not available");
            call.resolve(result);
        }
    }

    private void doCheckForNewRelease(FirebaseAppDistribution fad, PluginCall call) {
        fad.checkForNewRelease().addOnSuccessListener(release -> {
            JSObject result = new JSObject();
            if (release != null) {
                result.put("available", true);
                result.put("versionName", release.getDisplayVersion());
                result.put("versionCode", release.getVersionCode());
                String notes = release.getReleaseNotes();
                result.put("releaseNotes", notes != null ? notes : "");
            } else {
                result.put("available", false);
            }
            call.resolve(result);
        }).addOnFailureListener(e -> {
            Log.w(TAG, "Update check failed", e);
            JSObject result = new JSObject();
            result.put("available", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        });
    }

    /**
     * Start the update/install flow. Sends progress events to the web layer.
     */
    @PluginMethod()
    public void updateApp(PluginCall call) {
        try {
            FirebaseAppDistribution fad = FirebaseAppDistribution.getInstance();
            fad.updateApp()
                .addOnProgressListener(updateState -> {
                    JSObject event = new JSObject();
                    event.put("status", String.valueOf(updateState.getUpdateStatus()));
                    notifyListeners("updateProgress", event);
                })
                .addOnSuccessListener(aVoid -> {
                    call.resolve();
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "Update failed", e);
                    call.reject("Update failed: " + e.getMessage());
                });
        } catch (Exception e) {
            Log.w(TAG, "Firebase App Distribution not available", e);
            call.reject("Firebase App Distribution not available");
        }
    }

    /**
     * Get current app version info and tester sign-in status.
     */
    @PluginMethod()
    public void getAppInfo(PluginCall call) {
        try {
            String versionName = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0).versionName;
            long versionCode = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0).getLongVersionCode();

            boolean signedIn = false;
            try {
                signedIn = FirebaseAppDistribution.getInstance().isTesterSignedIn();
            } catch (Exception ignored) {}

            JSObject result = new JSObject();
            result.put("versionName", versionName != null ? versionName : "unknown");
            result.put("versionCode", versionCode);
            result.put("appId", getContext().getPackageName());
            result.put("testerSignedIn", signedIn);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get app info: " + e.getMessage());
        }
    }
}
