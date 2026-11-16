# Android shell

## System Overview

The Gradle project packages Brick Studio as an Android app that loads the HTTPS URL set by the root Capacitor configuration.

## Subdirectories & System Boundaries

- [App module](./app/README.md) declares the application ID, launcher, dependencies, and native source tree.

## Global Invariants

- The Gradle app module uses the same application ID as `capacitor.config.ts`, `com.tlc.robotstudio`.

## Global Side Effects

- The app can access the network. `npm run android:apk` synchronizes Capacitor and builds the debug APK.

## System Verification

- Run `npm run android:apk` from the repository root with the Android toolchain installed.
