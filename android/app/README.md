# Android application module

## Overview

The `:app` Gradle module builds the Brick Studio Capacitor shell.

## Interface

- [`build.gradle`](./build.gradle) configures the Android application and its Capacitor dependencies.
- [Source tree](./src/README.md) points to the production manifest and Java package.

## Invariants

- `android.namespace` and `defaultConfig.applicationId` are both `com.tlc.robotstudio`.

## Side Effects

- Gradle applies the Google Services plugin when it can read a nonempty `google-services.json`.

## Verification

- Run `npm run android:apk` from the repository root.
