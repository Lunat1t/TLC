# Tasks: Индивидуальный пульт Pybricks

**Input**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/controller.md](contracts/controller.md)

**Note**: Первый вариант кода был создан до этого файла. При выполнении задачи проверяются по текущему коду; ранее сделанная работа не считается доказательством выполнения без проверки.

## Phase 1: Setup

- [X] T001 Verify Spec Kit context, project root, and ignore patterns in .specify/, .agents/skills/, and .gitignore
- [X] T002 Replace live legacy controller entry and remove obsolete public/app.js, public/control.js, public/pybricks-config.js, public/style.css

## Phase 2: Foundational

- [X] T003 Implement strict config validation, port matrix, speed conversion, and command serialization in public/controller-model.js and src/lib/controller-layout.ts
- [X] T004 Verify controller model and safety cases in tests/controller-model.test.js and tests/run.js

## Phase 3: User Story 1 — Настраиваемые кнопки (P1, MVP)

**Goal**: Ученик создает парные и одиночные кнопки, назначает моторы и размещает кнопки на экране.

**Independent Test**: Добавить оба типа кнопок, переименовать, назначить порт, переместить мышью или пальцем и стрелками, удалить и сохранить; после перезагрузки раскладка восстановлена.

- [X] T005 [US1] Build the TLC-themed control screen and accessible controls in public/controller.html and public/controller.css
- [X] T006 [US1] Implement editor, placement, port assignment, pair/single buttons, lock, and per-port sliders in public/controller.js
- [X] T007 [US1] Verify pointer dragging, keyboard movement, layout persistence, and lock reset in public/controller.js and specs/002-custom-controller/quickstart.md

## Phase 4: User Story 2 — Bluetooth и программа хаба (P1)

**Goal**: Хаб с любым именем подключается через Pybricks BLE, а моторы движутся только после запуска и подтверждения программы.

**Independent Test**: Проверить отсутствие фильтра по имени, раздельные подключение и запуск, блокировку кнопок до READY, команды двух направлений и остановку по таймауту.

- [X] T008 [US2] Implement BLE discovery, connection, run command, READY/ACK gating, and stop handling in public/controller.js and public/pybricks-protocol.js
- [X] T009 [US2] Replace PrimeHub-specific code with port-driven motor program and watchdog in public/hub_program.py
- [X] T010 [US2] Verify malformed commands and lost-link braking in tests/test_controller_hub.py and package.json
- [X] T011 [US2] Provide one-time program download and accurate setup instructions in public/controller.html and public/controller.js

## Phase 5: User Story 3 — Сохранение на сайте (P2)

**Goal**: Авторизованный ученик получает раскладку на другом устройстве; без авторизации видна честная локальная копия.

**Independent Test**: Проверить GET/PUT с проверенной сессией, отказ 401 без неё, серверную валидацию и восстановление из локальной копии.

- [X] T012 [US3] Implement authenticated GET/PUT for controller layout in src/app/api/controller-layout/route.ts
- [X] T013 [US3] Implement cloud/local sync and clear status messages in public/controller.js
- [X] T014 [US3] Verify server validation, unauthenticated response, and overwrite protection in src/lib/controller-layout.ts and public/controller.js

## Phase 6: Polish

- [X] T015 Update site links and documentation in src/app/page.tsx, src/app/editor/page.tsx, README.md, and specs/002-custom-controller/quickstart.md
- [X] T016 Run npm test, npx tsc --noEmit, npm run build, and git diff --check
- [X] T017 Validate editor and persistence in a served browser and record any untested physical hub or second-device scenario in specs/002-custom-controller/quickstart.md

## Dependencies & Execution Order

Setup T001–T002 precedes foundation T003–T004. US1 and US2 depend on foundation. US3 depends on US1's layout schema. Polish follows all stories. Tasks touching public/controller.js execute sequentially.

## Parallel Opportunities

T005 and T009 use different files after foundation and can be developed in parallel. T010 can be prepared alongside T005. T012 can proceed while the UI work is in public/controller.js, but T013 follows T012.

## Implementation Strategy

Finish the configurable screen (US1) first, then connect the motor safety path (US2), then add account sync (US3). The MVP is US1 with local persistence; the full product includes US2 and US3.

## Implementation result

All 17 code and documentation tasks were verified on 2026-10-31. Physical hub and second authenticated device acceptance scenarios remain unverified and are listed in quickstart.md.

## Follow-up: Gamepad UX refinement

- [X] T018 [US1] Replace directional buttons with a Brawl Stars style movement stick that mixes left/right drive motors and a right action stick with a continuous lock in `public/controller.html` and `public/controller.js`.
- [X] T019 [US1] Add hub-aware motor role assignment, conflict checks, and migration for existing saved layouts in `public/controller-model.js` and `src/lib/controller-layout.ts`.
- [X] T020 [US1] Review the two-stick layout and editor on desktop and phone, then publish the verified production build.

### Refinement result

Production build `dpl_9AMwKvd93NfT2wd5knELnr9Z55Nf` is READY on `techlabcode.vercel.app`. The editor and two-stick screen were checked in the browser at desktop width and 390 px mobile width; the mobile page and editor had no horizontal overflow. Physical motor behavior remains unverified.

## Follow-up: LEGO-style visual alignment

- [X] T021 [US1] Align the controller palette, raised controls, and compact labels with the LEGO block editor; keep setup details collapsed in `public/controller.html` and `public/controller.css`.
- [X] T022 [US1] Build, publish the scoped controller update, and verify the production page at desktop width.

### Refinement result

Production deployment `dpl_9K77dUyjGgQa4fHYrZc8fKFrLTLy` serves the updated controller at `techlabcode.vercel.app/controller.html` (HTTP 200). The desktop page was visually checked in the browser. The local Next.js production build passed; physical Bluetooth and motor behavior were not tested.

## Follow-up: VEXcode-style device configuration

- [X] T023 [US1] Replace port dropdown-only setup with module cards and add-device menu for 2/4-motor drive trains, single motors, and linked motor groups; synchronize grouped motor outputs and preserve migration from saved v1 layouts.
- [X] T024 [US1] Build and publish the device configuration update, then verify device addition, port conflict prevention, and the action-stick assignment in production.

### Device configuration result

Production deployment `dpl_HG6W5XqDcA7k23qJVuTqUDimAEnS` is READY and serves the updated controller at `techlabcode.vercel.app`. Verified the default two-motor drivetrain and action motor, unavailable port options on occupied ports, add-device menu, and a linked two-motor group assigned to the action-stick selector. New-user defaults now show A/D and B correctly. Physical hub connection and motor output remain unverified.


## Follow-up: Arrow gamepad

- [X] T025 [US1] Remove both sticks from the controller UI, styles, and input handling; use a directional cross for drive/turn and vertical action arrows with a continuous lock.
- [X] T026 [US1] Build, publish the scoped UI update, and check the production page; physical hub behavior remains an on-device acceptance check.

### Arrow gamepad result

The production `/controller.html` responds HTTP 200 with the directional cross and action arrows, the old stick elements are absent, and the browser accessibility tree exposes the four drive directions and two action directions. `npm run build`, JavaScript syntax checks, and `git diff --check` pass. Physical BLE and motor output remain untested.


## Follow-up: Temporary blank controller canvas

- [X] T027 [US1] Keep the controller logic and device editor, but clear the control canvas and move Stop/Disconnect into the header; remove speed and help panels from the page.
- [X] T028 Move PWA installation to the home screen, build and publish the scoped update, and verify both routes in production.

### Temporary blank canvas result

Production deployment `dpl_44HysY2sL86LLSarAXvVaq1FBxSz` is READY on `techlabcode.vercel.app`. The controller route returns a blank control canvas with only header actions; the speed and help panels and floating install control are absent. The home route shows “Установить на главный экран” after hydration. The device editor still opens with module assignments and the program download. The exact scoped source set passed `npm run build`. Physical hub control was not exercised.
