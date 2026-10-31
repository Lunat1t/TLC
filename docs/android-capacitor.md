# TLC Android (Capacitor)

This is an isolated experiment on `feat/android-capacitor`. The Next.js UI is statically exported and loaded **locally** by an Android WebView. It does not require the Vercel website to display the editor.

## Requirements

- Node.js 22+, npm
- JDK 21
- Android Studio and Android SDK (plus an emulator or an Android tablet)
- Network access for npm packages on first setup

## First setup

```sh
npm install
npm run android:init
```

This builds the Next static export in `out/`, generates `android/` and synchronizes the assets/plugins. Commit `android/` once generated if you want a reproducible native project.

```sh
npm run android:open
```

Use Android Studio to run on a USB-connected tablet. To produce a debug APK:

```sh
npm run android:apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

For later web edits use `npm run android:sync`. A signed release APK needs a signing key; don't commit secrets or keystores.

## Expected behavior / caveats

- Editor, blocks, sheets and code generation are local and should operate without internet. Supabase login and external instruction pages still require internet.
- Existing browser localStorage projects do **not** automatically transfer to the Android app, because native WebView storage is isolated. Export `.robotproj.json` in the browser first, then import on Android. Verify import/export on real hardware.
- Native BLE communication with SPIKE and EV3 has **not yet** been implemented. The current editor Bluetooth button remains a placeholder. Do not mistake wrapping the web app for implementing hub connectivity.
- Android's file download/share workflow should be validated on a tablet, especially Pybricks `.py` export.
- Static export cannot run server routes, server actions, rewrites, or Next middleware. Avoid these in this branch.
- Legacy `/controller.html` uses browser Web Bluetooth and is not guaranteed to function in Android WebView.
- This branch does not yet include a checked-in Android Studio project, CI build, or a device-tested APK. Run `android:init` on an Android development workstation.
