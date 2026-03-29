import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pcsmoveiq.app",
  appName: "PCS MoveIQ",
  webDir: "dist",
  server: {
    url: "https://pcs-moveiq.replit.app",
    // cleartext not needed — backend is HTTPS
  },
};

export default config;
