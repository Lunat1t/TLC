# Brick Studio Android activity

## Overview

The Android launcher opens the Capacitor bridge for Brick Studio.

## Interface

- [`MainActivity`](./MainActivity.java) is the Java activity registered as `.MainActivity` in the production manifest.

## Invariants

- `MainActivity` extends Capacitor's `BridgeActivity` and declares no overrides.

## Side Effects

- The class inherits activity lifecycle behavior from `BridgeActivity`.

## Verification

- Run `npm run android:apk` from the repository root.
