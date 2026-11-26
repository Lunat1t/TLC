# Browser and hub assets

## Overview

Next.js serves the files in this directory as static assets. Some scripts run in the browser and the Python programs run on a Pybricks hub.

## Interface

- [`compileControllerProgram()` and `commandsFor()`](./controller-program.js) compile controller blocks and format hub commands.
- [`MODULE_DEFS`, `BLOCK_MODULES` and the module helpers](./block-modules.js) are the single registry of block modules: which modules a block offers, what conflicts, what is required for export and which defaults and texts the editor shows.
- [`validateConfig()`](./controller-model.js) validates controller layout and port settings.
- [`validateProject()`, `loadProjects()`, and `saveProjects()`](./projects.js) work with the versioned project format and a caller-provided storage object.
- [`commandBytes()` and `parseEvent()`](./pybricks-protocol.js) encode commands and decode events. [`subscribeNotifications()`](./notifications.js) attaches the Bluetooth notification handler.
- [`process()`](./hub_program.py) processes controller commands. [`command()`](./one_motor_A.py) drives the single motor diagnostic. [`DirectDrive`](./socer_full.py) is the soccer program's drive adapter. [`check_motor_ports.py`](./check_motor_ports.py) probes hub ports.
- [`install-app.js`](./install-app.js) handles the browser install prompt. [`sw.js`](./sw.js) registers service worker lifecycle handlers.
- [PDF worker](./vendor/README.md) parses documents for the browser reader.

## Invariants

- `projects.js` accepts project version `1` and the `spike` and `ev3` hub keys.
- `hub_program.py` uses a 600 ms command timeout while the link is active. `one_motor_A.py` defines its own timeout and port configuration.

## Side Effects

- `saveProjects()` writes the project list to storage. `subscribeNotifications()` starts characteristic notifications and attaches the caller's handler.
- The Python programs use attached hub hardware. Controller commands can start and stop motors.
- The service worker calls `skipWaiting()` on install and claims clients on activation.

## Verification

- Run `npm test` from the repository root for project and controller checks.
