# Hub diagnostics

## Overview

A Linux Bluetooth diagnostic for the standard SPIKE hub service.

## Interface

- [`main()`](./read_hub.py) scans with Bleak, selects the SPIKE service, and prints received notifications as hexadecimal bytes.

## Invariants

- `main()` connects only if the scan returns exactly one matching hub. It sends the three-byte InfoRequest `00 00 02` to `RX`.

## Side Effects

- `main()` starts a Bluetooth scan, connects through Bleak, subscribes to `TX`, writes the InfoRequest, and stops notifications before leaving the client context.

## Verification

- Run `npm test` from the repository root for the shared controller checks. The diagnostic requires a Linux Bluetooth adapter and a hub.
