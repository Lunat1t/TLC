# Tasks: Управление модулями на поле пульта

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/controller-canvas.md`, `quickstart.md`

## Phase 1: Setup

- [X] T001 Confirm existing controller and Spec Kit context in `public/controller.html`, `public/controller.js`, and `.specify/feature.json`

## Phase 2: Foundation

- [X] T002 [P] Extend client config validation and legacy layout migration in `public/controller-model.js`
- [X] T003 [P] Extend matching server validation in `src/lib/controller-layout.ts`

## Phase 3: User Story 1 — add module and control block (P1)

**Goal**: The left settings panel and separate plus picker create a matching module control on the field.

**Independent check**: Open settings, choose a supported module, observe picker close and matching card plus control appear.

- [X] T004 [US1] Build left settings panel, module picker, and field markup in `public/controller.html`
- [X] T005 [US1] Implement add/remove module and draft rendering in `public/controller.js`
- [X] T006 [US1] Style left panel, picker, blocks, and responsive field in `public/controller.css`

## Phase 4: User Story 2 — arrange and confirm (P1)

**Goal**: Move blocks inside the field, then save and lock the entire layout with the checkmark.

**Independent check**: Drag and keyboard move, cancel and verify rollback, confirm and reload to verify persistence and fixed positions.

- [X] T007 [US2] Implement bounded pointer and keyboard placement, cancel, and global confirmation in `public/controller.js`
- [X] T008 [US2] Add placement affordances and mobile field rules in `public/controller.css`

## Phase 5: User Story 3 — operate safely (P1)

**Goal**: Drive and individual motor blocks send commands to assigned ports only after READY.

**Independent check**: Verify every module has independent buttons and locks; edit, stop, disconnect, and release halt motors.

- [X] T009 [US3] Route drive and motor inputs by module ID through existing BLE safety gates in `public/controller.js`
- [X] T010 [US3] Retain speed, reverse, port assignment, status, and Pybricks download in `public/controller.html` and `public/controller.js`

## Phase 6: Polish and validation

- [X] T011 Check model migration, duplicate ports, and layout validation in `tests/controller-model.test.js` and `tests/controller-server.test.js`
- [X] T012 Run build and browser scenarios from `specs/003-module-control-canvas/quickstart.md`; fix issues in controller files
- [X] T013 Publish controller and server validator together, then verify production page and report hardware limits

## Dependencies and execution order

T001 → T002/T003 → T004/T005/T006 → T007/T008 → T009/T010 → T011/T012 → T013.
T002 and T003 can be completed independently; story phases integrate into the same controller files and run in order.

## Implementation strategy

Complete all three P1 stories as one release because a control block without safe command routing is not a usable product.
