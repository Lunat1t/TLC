import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tlc.robotstudio",
  appName: "TLC",
  webDir: "out",
  android: {
    allowMixedContent: false,
    backgroundColor: "#f4f8fa",
  },
};

export default config;
