# RoomScanPlugin — Xcode Setup Guide

## Requirements
- Xcode 15+
- iOS deployment target: **16.0+**
- Physical device: **iPhone 12 Pro / 13 Pro / 14 Pro / 15 Pro** or **iPad Pro** (M1/M2) with LiDAR

## Step 1 — Add the iOS platform to Capacitor

```bash
cd client
npx cap add ios
npx cap sync ios
```

## Step 2 — Open in Xcode

```bash
npx cap open ios
```

## Step 3 — Add the Swift package

1. In Xcode, go to **File → Add Package Dependencies…**
2. Choose **Add Local…** and navigate to `client/ios-plugin/RoomScanPlugin`
3. Click **Add Package**
4. In the **Target** dialog, add `RoomScanPlugin` to your app target

## Step 4 — Register the plugin

Open `App/AppDelegate.swift` and add:

```swift
import RoomScanPlugin

// Inside application(_:didFinishLaunchingWithOptions:)
// Capacitor auto-discovers @objc(RoomScanPlugin) — no manual registration needed.
```

Or if you use `CAPBridgeViewController`, Capacitor will discover the plugin automatically via the `CAP_PLUGIN` macro in `RoomScanPlugin+Register.m`.

## Step 5 — Add Privacy descriptions

In Xcode, select your app target → **Info** tab, and add:

| Key | Value |
|-----|-------|
| `NSCameraUsageDescription` | MoveIQ needs camera access to scan your rooms with LiDAR. |

## Step 6 — Set the deployment target

1. Select your app target → **General**
2. Set **Minimum Deployments** to **iOS 16.0**

## Step 7 — Add the RoomPlan framework capability

1. Select your app target → **Signing & Capabilities**
2. No extra entitlement is needed — RoomPlan is a standard framework.
   (If you see missing-framework errors, go to **Build Phases → Link Binary With Libraries** and add `RoomPlan.framework`)

## Step 8 — Build & run

Connect your LiDAR-capable iPhone, select it as the run destination, and press **⌘R**.

---

## Testing notes

- The LiDAR scanner will **not work in the Simulator** — you need a physical device.
- On non-LiDAR devices, `checkSupport()` returns `{ supported: false }` and `startScan()` rejects gracefully.
- Scan results are stored locally in `localStorage` under the key `moveiq_scan_data` until the backend adds a `scanData` column to the rooms table.
