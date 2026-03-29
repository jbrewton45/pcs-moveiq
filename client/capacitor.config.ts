import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pcsmoveiq.app",
  appName: "PCS MoveIQ",
  webDir: "dist",
  server: {
    // In production, the app loads from the bundled web assets.
    // For development, uncomment and set to your dev server URL:
    // url: "http://10.0.2.2:5173",
    // cleartext: true,
  },
};

export default config;
