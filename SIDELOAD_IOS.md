# Sideloading PCS MoveIQ onto your iPhone via Xcode (Free Apple ID)

No paid Apple Developer account needed. You just need Xcode on your Mac and a free Apple ID.

---

## Step 1 — Clone the repo on your Mac

```bash
git clone https://github.com/jbrewton45/pcs-moveiq.git
cd pcs-moveiq
```

## Step 2 — Install dependencies and build the web app

```bash
cd client
npm install
npm run build
```

## Step 3 — Add the iOS Capacitor platform

```bash
npx cap add ios
npx cap sync ios
```

This creates a `client/ios/` folder with a full Xcode project.

## Step 4 — Add the RoomScan plugin in Xcode

1. Open the project: `npx cap open ios`
2. In Xcode menu: **File → Add Package Dependencies…**
3. Click **Add Local…** → navigate to `client/ios-plugin/RoomScanPlugin` → **Add Package**
4. When prompted, add `RoomScanPlugin` to the **App** target

## Step 5 — Configure signing with your free Apple ID

1. In Xcode, click the **App** project in the sidebar
2. Select the **App** target → **Signing & Capabilities**
3. Check **Automatically manage signing**
4. Under **Team**, click **Add an Account…** and sign in with your personal Apple ID (free)
5. Xcode will create a free provisioning profile — this lets you install on your own device for 7 days

## Step 6 — Set deployment target

Still in the App target → **General** tab:
- Set **Minimum Deployments** to **iOS 16.0**

## Step 7 — Add camera privacy description

In the **Info** tab of the App target, add a row:
- Key: `Privacy - Camera Usage Description`
- Value: `MoveIQ needs camera access to scan your rooms with LiDAR.`

## Step 8 — Trust the app on your iPhone

1. Connect your iPhone via USB
2. On iPhone: **Settings → General → VPN & Device Management**
3. Tap your Apple ID email → **Trust**

## Step 9 — Build & install

1. Select your iPhone as the run destination (top bar in Xcode)
2. Press **⌘R** (or the ▶ Play button)
3. Xcode builds and installs directly to your phone — no App Store needed

---

## Re-signing after 7 days

Free Apple ID profiles expire after 7 days. To renew:
1. Plug in your iPhone
2. Open the Xcode project (`npx cap open ios` from `client/`)
3. Press **⌘R** again — Xcode re-signs and reinstalls automatically

---

## LiDAR scanning notes

- Works on: iPhone 12 Pro, 13 Pro, 14 Pro, 15 Pro, 16 Pro (and iPad Pro M1/M2)
- On non-LiDAR iPhones: the app works fully but shows "LiDAR not available" in the Floorplan tab
- The Floorplan tab detects support automatically and adjusts its UI

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Untrusted Developer" on iPhone | Settings → General → VPN & Device Management → Trust your Apple ID |
| Build fails with "No signing certificate" | Xcode → Preferences → Accounts → add your Apple ID |
| `npx cap add ios` not found | Run `npm install` inside `client/` first |
| RoomPlan framework not found | Xcode → App target → Build Phases → Link Binary With Libraries → add `RoomPlan.framework` |
