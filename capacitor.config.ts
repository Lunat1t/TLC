import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.TLC_ANDROID_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.tlc.robotstudio",
  appName: "TLC",
  webDir: "android-shell",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: false,
        },
      }
    : {}),
  android: {
    allowMixedContent: false,
    backgroundColor: "#f4f8fa",
  },
};

export default config;
