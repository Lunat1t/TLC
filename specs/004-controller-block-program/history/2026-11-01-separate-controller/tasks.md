# Tasks: Программа пульта из блоков

**Input**: Design documents from `specs/004-controller-block-program/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/controller-program.md`, `quickstart.md`)  
**Branch**: `004-controller-block-program`  
**Status**: Ready for Implementation

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project configuration and test runner registration

- [X] T001 Register `tests/controller-program.test.js` in test harness in `tests/run.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core data models, compiler, and hub protocol extension needed for all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Extend `BlockType` with `"button" | "stop"`, add `button` and `event` fields to `WorkspaceBlock`, and update `readBlocks` and `addBlock` in `src/lib/workspace.ts`
- [X] T003 [P] Update chain attachment rules and snap targets in `src/lib/workspace.ts` to prevent attaching above `button` and disallow `if`/`start`/`button` under `button`
- [X] T004 [P] Update `generatePybricks` in `src/lib/workspace.ts` to skip chains with root `type === "button"` and map `stop` to `motor.brake()`
- [X] T005 [P] Create `public/controller-program.js` implementing `CONTROLLER_BUTTONS`, `BUTTON_LABELS`, `BUTTON_KEYS`, `compileControllerProgram`, `describeAction`, and `commandsFor`
- [X] T006 [P] Create typed wrapper `src/lib/controller-program.ts` re-exporting `public/controller-program.js`
- [X] T007 [P] Create comprehensive unit tests for `compileControllerProgram` and protocol commands in `tests/controller-program.test.js`
- [X] T008 Update Pybricks hub program in `public/hub_program.py` with protocol v3 (`a`, `t`, `d`, max speed 1000, `SOCER3_READY`, keeping v2 compatibility and 600ms watchdog)
- [X] T009 [P] Update hub simulation tests for protocol v3 commands and watchdog behavior in `tests/test_controller_hub.py`

**Checkpoint**: Foundation ready — compiler, data models, and hub protocol tests pass (`npm test`).

---

## Phase 3: User Story 1 - Собрать программу в редакторе (Priority: P1) 🎯 MVP

**Goal**: Ученик в редакторе блоков может добавить шапку «Когда кнопка [▲] [нажата/отпущена]», блок «Стоп мотора», прикрепить блоки движения и сохранить проект.

**Independent Test**: В `/editor` перетащить шапку пульта и моторные блоки, проверить примагничивание, сохранение в проекте и неизменность экспорта автономного кода Pybricks.

### Tests for User Story 1
- [X] T010 [P] [US1] Add unit tests for `WorkspaceBlock` controller mutations and Pybricks export exclusion in `tests/workspace.test.js`

### Implementation for User Story 1
- [X] T011 [P] [US1] Create UI block component for controller event header and motor stop block in `src/components/editor/controller-blocks.tsx`
- [X] T012 [US1] Add "Пульт" category to block palette in `src/app/editor/page.tsx` with "Когда кнопка нажата", "Когда кнопка отпущена", and "Стоп мотора"
- [X] T013 [US1] Add template button "Держи — едет, отпусти — стоп" in palette in `src/app/editor/page.tsx` that adds paired pressed/released chains

**Checkpoint**: User Story 1 functional — блоки пульта собираются и сохраняются в проекте.

---

## Phase 4: User Story 2 - Открыть на пульте и убрать настройки (Priority: P1)

**Goal**: Страница пульта открывается по кнопке из редактора, загружает выбранный проект и показывает фиксированный геймпад из 10 кнопок без старой панели настроек модулей.

**Independent Test**: Нажать «Пульт» в редакторе → открывается `controller.html?project=<id>`, кнопки «Настроить» и панели модулей нет, 10 кнопок отображаются с правильными метками.

### Implementation for User Story 2
- [X] T014 [P] [US2] Add header button "Пульт" in `src/app/editor/page.tsx` saving the project and opening `/controller.html?project=<id>`
- [X] T015 [US2] Update `public/controller.html` layout: remove `#edit`, `#editor`, `#modulePicker`, `#editActions`; add `#project` select, `#reload` button, link to editor, and `#gamepad` with 10 buttons
- [X] T016 [US2] Update `public/controller.css`: remove styles for obsolete module cards/drawer; style the 10-button gamepad (D-pad left, action buttons right, shoulder buttons top)
- [X] T017 [US2] Update `public/controller.js` to load projects from `localStorage["robot-studio-projects-v1"]`, listen for `storage` events, parse URL project ID, and render buttons with `data-has-handler`

**Checkpoint**: User Stories 1 and 2 work together — проект собирается в редакторе и открывается на пульте.

---

## Phase 5: User Story 3 - Проверить без робота (пробный режим) (Priority: P1)

**Goal**: Ученик может нажимать кнопки экранного пульта до подключения робота; лента событий показывает выполняемые действия без отправки команд моторам.

**Independent Test**: Нажать кнопку с программой на экране пульта без подключения Bluetooth → в `#eventLog` появляется запись о действии, кнопка подсвечивается, моторы не вызываются.

### Implementation for User Story 3
- [X] T018 [P] [US3] Add `#eventLog` container (`role="log"`, `aria-live="polite"`) and `#modeBadge` to `public/controller.html`
- [X] T019 [US3] Implement trial mode, pointerdown/pointerup handlers, visual press states, and event log updates (max 30 items) in `public/controller.js`
- [X] T020 [P] [US3] Style `#modeBadge` and `#eventLog` with tactile indicators in `public/controller.css`

**Checkpoint**: User Story 3 functional — ученик видит результат нажатий в пробном режиме.

---

## Phase 6: User Story 4 - Управлять роботом (live режим на хабе) (Priority: P1)

**Goal**: После подключения по Bluetooth и запуска программы хаба нажатия кнопок выполняют заданные действия моторов на роботе по протоколу v3.

**Independent Test**: Подключить хаб, нажать «Старт» → после READY статус меняется на «Робот управляется»; удержание кнопки крутит мотор, отпускание останавливает; аварийный стоп тормозит все моторы.

### Implementation for User Story 4
- [X] T021 [US4] Implement asynchronous action chain runner with `AbortController`, step delay estimation, and cancellation on new events in `public/controller.js`
- [X] T022 [US4] Connect action runner to BLE `writeBytes` queue in `public/controller.js`, supporting protocol v2 (`m`) and v3 (`a`, `t`, `d`) commands
- [X] T023 [US4] Connect safety stops (emergency stop button, tab visibility change, window blur, BLE disconnect, `SOCER2_LINK_LOST`) to cancel active runners and send `x\n` in `public/controller.js`

**Checkpoint**: User Story 4 functional — робот слушается команд пульта, аварийные остановки гарантированы.

---

## Phase 7: User Story 5 - Исправить ошибку (валидация и подсказки) (Priority: P2)

**Goal**: Если в программе пульта есть конфликты, дубликаты шапок или отсутствующие порты, ученик видит понятное объяснение со ссылкой на исправление в редакторе.

**Independent Test**: Добавить две одинаковые шапки «▲ нажата» → на пульте появляется блок предупреждения `#programErrors` с текстом ошибки и ссылкой «Открыть в редакторе», ошибочная кнопка приглушена.

### Implementation for User Story 5
- [X] T024 [P] [US5] Add `#programErrors` alert container in `public/controller.html`
- [X] T025 [US5] Render validation errors from `compileControllerProgram` and disable affected buttons with error tooltips in `public/controller.js`
- [X] T026 [US5] Display controller block compiler error markers and messages directly on canvas blocks in `src/app/editor/page.tsx`

**Checkpoint**: User Story 5 functional — ошибки в программе наглядно объясняются.

---

## Phase 8: User Story 6 - Клавиатурное управление (Priority: P2)

**Goal**: На компьютере ученик может управлять пультом с клавиатуры (стрелки, J, K, U, I, Q, E) с отображением подсказок клавиш на кнопках.

**Independent Test**: Нажать стрелку вверх на клавиатуре → кнопка ▲ активируется, лента регистрирует нажатие; отпускание клавиши отпускает кнопку; повтор нажатия при удержании игнорируется.

### Implementation for User Story 6
- [X] T027 [P] [US6] Add `<kbd>` shortcut indicators to gamepad button elements in `public/controller.html` and `public/controller.css`
- [X] T028 [US6] Implement global `keydown`/`keyup` handlers with `event.repeat` suppression and key-to-button mapping in `public/controller.js`

**Checkpoint**: User Story 6 functional — клавиатура полностью поддерживает управление пультом.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Regression testing, visual polish, and quickstart validation

- [X] T029 [P] Update HTML layout assertions in `tests/app.test.js` to ensure `#edit` is removed and 10 gamepad buttons with event log exist
- [X] T030 Ensure 360px viewport responsiveness without horizontal scrolling in `public/controller.css`
- [X] T031 Run full regression suite (`npm test`, `npm run build`) and validate against scenarios in `specs/004-controller-block-program/quickstart.md`

### Follow-up: defects found by `$speckit-analyze`

- [X] T032 [US3] Align compiled handler lookup with the controller page and verify trial/live button execution in `public/controller.js`, `public/controller-program.js`, and `tests/controller-ui.test.js`
- [X] T033 [US4] Reset READY and stop active motors on emergency stop, disconnect, project changes, and interrupted timed actions in `public/controller.js`
- [X] T034 [US4] Complete timed power actions with motor stop and one shared wait in `public/controller-program.js` and `tests/controller-program.test.js`
- [X] T035 [US5] Validate each handler against READY ports and hub protocol, disable affected buttons, and show actionable errors in `public/controller.js` and `public/controller-program.js`
- [X] T036 Run automated regression, build, and scenario checks for T032–T035
- [X] T037 [US4] Re-issue repeated motor commands after finite moves in `public/hub_program.py` and verify with `tests/test_controller_hub.py`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Phase 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2 and US1.
- **User Story 3 (Phase 5)**: Depends on US2.
- **User Story 4 (Phase 6)**: Depends on US3 and Phase 2 (hub protocol).
- **User Story 5 (Phase 7)**: Depends on US2.
- **User Story 6 (Phase 8)**: Depends on US3.
- **Polish (Phase 9)**: Depends on all user stories being complete.

### Parallel Opportunities

- Within Phase 2: T003, T004, T005, T006, T007, T009 can be executed in parallel once T002/T008 are started.
- Within Phase 3: T010 and T011 can run in parallel.
- Within Phase 4: T014 and T016 can run in parallel.
- Within Phase 5: T018 and T020 can run in parallel.
- User Story 5 (Validation) and User Story 6 (Keyboard) can run in parallel once US3 is complete.

---

## Implementation Strategy

### MVP First (Phases 1, 2, 3, 4, 5)
1. Complete Setup (Phase 1) and Foundational (Phase 2).
2. Complete US1 (Editor blocks for controller) and US2 (Controller page cleanup & project loading).
3. Complete US3 (Trial mode with event log).
4. **MVP Validation**: The student can assemble a controller program in blocks, open the controller, and test all button events in the browser without a robot.

### Incremental Delivery
1. Add US4 (Live robot execution via protocol v3 and Web Bluetooth).
2. Add US5 (Validation warnings and links to editor).
3. Add US6 (Keyboard accessibility and hotkeys).
4. Complete Polish (Phase 9: test suite & mobile layout validation).
