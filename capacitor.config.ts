import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.TLC_ANDROID_SERVER_URL?.trim() || "https://techlabcode.vercel.app";
const parsedUrl = new URL(serverUrl);
if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
  throw new Error("TLC_ANDROID_SERVER_URL must be an HTTPS URL without credentials");
}

const config: CapacitorConfig = {
  appId: "com.tlc.robotstudio",
  appName: "Brick Studio",
  webDir: "android-shell",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: false,
          errorPath: "offline.html",
        },
      }
    : {}),
  android: {
    allowMixedContent: false,
    backgroundColor: "#f4f8fa",
  },
};

export default config;
