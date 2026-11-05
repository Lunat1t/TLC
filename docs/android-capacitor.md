# TLC Android (Capacitor)

The Android app is a Capacitor WebView wrapper for the hosted TLC site. TLC uses Next.js server routes and Supabase session middleware, so Android must load an HTTPS deployment; a static export is not supported. The WebView and server use the same API routes for teacher uploads and authentication.

## Requirements

- Node.js 22+, npm
- JDK 21
- Android Studio and Android SDK (plus an emulator or Android tablet)
- An HTTPS deployment of TLC

## Configure and build

Set `TLC_ANDROID_SERVER_URL` to the HTTPS base URL of the TLC deployment before syncing Capacitor. In GitHub, add it as a repository Actions variable so the `main` workflow can package a debug APK. Keep the URL free of credentials and tokens.

```sh
npm install
TLC_ANDROID_SERVER_URL=https://your-tlc-host.example npm run android:init
npm run android:open
```

To produce a debug APK:

```sh
TLC_ANDROID_SERVER_URL=https://your-tlc-host.example npm run android:apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. For later web edits use `TLC_ANDROID_SERVER_URL=... npm run android:sync`. A signed release APK needs a signing key; do not commit secrets or keystores.

Without `TLC_ANDROID_SERVER_URL`, the package falls back to the local setup page in `android-shell/index.html`; it does not contain the TLC application. The Actions workflow requires the repository variable before producing an APK.

## Known limits

- Projects stored in browser localStorage do not automatically transfer to Android because the native WebView has separate storage. Export/import a `.robotproj.json` file to transfer projects.
- Native BLE communication with SPIKE and EV3 has not been implemented. The editor Bluetooth control remains a placeholder.
- Android file download/share behavior should be checked on a tablet, especially Pybricks `.py` export.
- Legacy `/controller.html` uses browser Web Bluetooth and may not work in Android WebView.
- A device-tested APK and checked-in Android Studio project have not been produced yet. Run `android:init` on an Android development workstation.
