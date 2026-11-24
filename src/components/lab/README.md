# Рабочее место TLC

## Overview

Компоненты рабочего места отображают доску, положение элементов, обои и напарника. Настройки, расстановка и содержимое доски передаются через общее состояние аккаунта.

## Interface

- `AccountWorkspaceProvider` и `useAccountWorkspace` предоставляют значения секций `settings`, `layout`, `board`, `projects` и операцию `update`. [account-workspace.tsx](./account-workspace.tsx)
- `WorkspaceSettings`, `DockShortcut`, `defaults`, `cleanShortcut` и `useWorkspaceSettings` описывают, нормализуют и обновляют настройки. `useDockShortcuts` даёт список закреплённых ссылок и операции `pin` и `unpin`. `DOCK_DRAG_TYPE` задаёт MIME-тип для переноса ссылки. [workspace-settings.ts](./workspace-settings.ts) · [dock-shortcuts.ts](./dock-shortcuts.ts)
- `LabBoard` выбирает состояние загрузки или `PersonalBoard`. Доска показывает аватар, часы, проекты и закреплённые материалы. `DesktopCanvas` даёт контекст расположения для `DesktopItem`, а `DesktopContextMenu` вызывает переданные действия добавления. [lab-board.tsx](./lab-board.tsx) · [desktop-canvas.tsx](./desktop-canvas.tsx) · [desktop-context-menu.tsx](./desktop-context-menu.tsx)
- `WallpaperPicker` принимает `onBusyChange` и даёт выбрать, удалить или изменить размещение обоев. [wallpaper-picker.tsx](./wallpaper-picker.tsx)
- `LabCompanion` связывает SVG-персонажа с `CompanionBrain`. `BuddyMode` и `Platform` описывают режим и поверхность, а `BUDDY_W` и `BUDDY_H` задают габариты для расчёта движения. `bodyPose` возвращает `BodyPose`, `easePoseValue` интерполирует числа в строках SVG, а `walkPose` строит шаг с периодом `WALK_CYCLE_DISTANCE`. [lab-companion.tsx](./lab-companion.tsx) · [companion-brain.ts](./companion-brain.ts) · [body-pose.ts](./body-pose.ts) · [walk-pose.ts](./walk-pose.ts)

## Invariants

- `AccountWorkspaceProvider` пересоздаёт состояние при смене `userId`. `AccountWorkspaceSession` принимает ответ только для текущего аккаунта, восстанавливает черновик при совпадении ревизии и отправляет обновления последовательно. [account-workspace.tsx](./account-workspace.tsx)
- `DesktopCanvas` хранит координаты `x` и `y` в диапазоне от 0 до 1. `DesktopItem` перетаскивается только после готовности расстановки и при снятой блокировке. `PersonalBoard` читает до 18 материалов, а `save` отклоняет данные, если длина их JSON превышает 3 000 000 символов. [desktop-canvas.tsx](./desktop-canvas.tsx) · [lab-board.tsx](./lab-board.tsx)
- `cleanShortcut` принимает внутренние пути и HTTP(S) URL без учётных данных. `useDockShortcuts` исключает фиксированные маршруты из пользовательских закреплений и ограничивает список десятью ссылками. `prepareWallpaper` принимает JPG, PNG и WebP до 12 000 000 байт и готовит JPEG длиной до 900 000 символов. [workspace-settings.ts](./workspace-settings.ts) · [dock-shortcuts.ts](./dock-shortcuts.ts) · [wallpaper-picker.tsx](./wallpaper-picker.tsx)
- `CompanionBrain.setWorld` обновляет положение и проверяет, сохранилась ли опора. `LabCompanion` использует спокойный режим при настройке уменьшенного движения и останавливает цикл кадров на скрытой вкладке. [companion-brain.ts](./companion-brain.ts) · [lab-companion.tsx](./lab-companion.tsx)

## Side Effects

- `AccountWorkspaceSession` для вошедшего аккаунта читает и обновляет `/api/workspace`, а для гостя (`userId === null`) хранит секции в `localStorage` под ключами `tlc-workspace-guest:v1:{section}` без миграции в аккаунт. Создаёт отдельный идентификатор экземпляра синхронизации, а черновики восстановления хранит в `localStorage` с ключом, включающим аккаунт, секцию и этот идентификатор. При запуске проверяет оставшиеся черновики аккаунта, включая закрытые вкладки. `downloadRecovery` сохраняет локальную копию в JSON. [account-workspace.tsx](./account-workspace.tsx)
- `DesktopItem` следит за размерами через `ResizeObserver` и записывает расстановку через `DesktopCanvas`. `InlineNote` сохраняет текст после паузы, при потере фокуса и при `pagehide`. `WallpaperPicker` преобразует выбранное изображение в браузере и обновляет секцию настроек. [desktop-canvas.tsx](./desktop-canvas.tsx) · [lab-board.tsx](./lab-board.tsx) · [wallpaper-picker.tsx](./wallpaper-picker.tsx)
- `LabCompanion` измеряет карточки и ярлыки как поверхности, обновляет атрибуты SVG в цикле кадров и сохраняет имя, спокойный режим и счётчики под ключом `tlc-companion-v1:{userId}` в `localStorage`. [lab-companion.tsx](./lab-companion.tsx)

## Verification

- Из корня репозитория запустите `npm test`.

## Cloud synchronization

- `workspace-sync.ts` loads the account workspace on startup, focus, return to a visible tab, reconnect and every 10 seconds while visible. Writes are serialized with the server's revision guard. Distinct programs, cards and positions merge by ID; conflicting changes to the same entity retain local recovery data and require explicit resolution. Choosing the cloud version archives every conflicting source before removing recovery records.
- `useAccountProjects` uses the `projects` array section for authenticated accounts. Guest programs continue using `robot-studio-projects-v1`; old browser programs are copied into the account only through an explicit action. Their original browser data is retained. Program backups and editor drafts are scoped by account; each editor instance has its own key. Acknowledged writes clear only matching generations or rebase a newer queued draft.
- Editor refresh never replaces an open editing session silently. The editor offers loading a newer remote version and downloading local content. Notes update clean text remotely and preserve dirty text during a conflict. Desktop coordinates are normalized, so the same saved position can have different pixel coordinates on different screen sizes.
- Apply `supabase/migrations/20261123155054_workspace_projects.sql` before deploying the new API/client. It only extends section/type constraints, preserving existing workspace data, owner policies and the revision RPC. The migration has not been applied to production during development.
- Regression checks in `tests/workspace-sync.test.ts` cover two-client synchronization, concurrent edits, conflicts, reconnect/reopen recovery, revision acknowledgements and editor draft generations. Run with `node --experimental-strip-types --test tests/workspace-sync.test.ts` or `npm test`.
