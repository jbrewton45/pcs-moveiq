package com.pcsmoveiq.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.firebase.appdistribution.FirebaseAppDistribution;

/**
 * Capacitor plugin that bridges Firebase App Distribution update checks
 * to the React web layer. Exposes two methods:
 *
 *   checkForUpdate()  — returns { available, versionName, versionCode, releaseNotes }
 *   updateApp()       — triggers the Firebase App Distribution update flow
 *
 * Fails gracefully if Firebase is not configured or unavailable.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String TAG = "AppUpdatePlugin";

    @PluginMethod()
    public void checkForUpdate(PluginCall call) {
        try {
            FirebaseAppDistribution appDistribution = FirebaseAppDistribution.getInstance();
            appDistribution.checkForNewRelease()
                .addOnSuccessListener(release -> {
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
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "Update check failed", e);
                    JSObject result = new JSObject();
                    result.put("available", false);
                    result.put("error", e.getMessage());
                    call.resolve(result);
                });
        } catch (Exception e) {
            Log.w(TAG, "Firebase App Distribution not available", e);
            JSObject result = new JSObject();
            result.put("available", false);
            result.put("error", "Firebase App Distribution not available");
            call.resolve(result);
        }
    }

    @PluginMethod()
    public void updateApp(PluginCall call) {
        try {
            FirebaseAppDistribution appDistribution = FirebaseAppDistribution.getInstance();
            appDistribution.updateApp()
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

    @PluginMethod()
    public void getAppInfo(PluginCall call) {
        try {
            String versionName = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0).versionName;
            long versionCode = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0).getLongVersionCode();
            JSObject result = new JSObject();
            result.put("versionName", versionName != null ? versionName : "unknown");
            result.put("versionCode", versionCode);
            result.put("appId", getContext().getPackageName());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get app info: " + e.getMessage());
        }
    }
}
