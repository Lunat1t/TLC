# Рабочее место TLC

## Overview

Компоненты рабочего места отображают доску, положение элементов, обои и напарника. Настройки, расстановка и содержимое доски передаются через общее состояние аккаунта.

## Interface

- `AccountWorkspaceProvider` и `useAccountWorkspace` предоставляют значения секций `settings`, `layout`, `board` и совместимый снимок `projects` из отдельного хранилища программ и операцию `update`. [account-workspace.tsx](./account-workspace.tsx)
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

- `AccountWorkspaceSession` для вошедшего аккаунта читает и обновляет `/api/workspace`, а для гостя (`userId === null`) хранит секции в `localStorage` под ключами `tlc-workspace-guest:v1:{section}` без миграции в аккаунт. Создаёт отдельные идентификаторы экземпляров; черновики секций хранятся в `localStorage`, а программ — в IndexedDB с ключами аккаунта и экземпляра. При запуске проверяет оставшиеся черновики аккаунта, включая закрытые вкладки. `downloadRecovery` сохраняет локальную копию в JSON. [account-workspace.tsx](./account-workspace.tsx)
- `DesktopItem` следит за размерами через `ResizeObserver` и записывает расстановку через `DesktopCanvas`. `InlineNote` сохраняет текст после паузы, при потере фокуса и при `pagehide`. `WallpaperPicker` преобразует выбранное изображение в браузере и обновляет секцию настроек. [desktop-canvas.tsx](./desktop-canvas.tsx) · [lab-board.tsx](./lab-board.tsx) · [wallpaper-picker.tsx](./wallpaper-picker.tsx)
- `LabCompanion` измеряет карточки и ярлыки как поверхности, обновляет атрибуты SVG в цикле кадров и сохраняет имя, спокойный режим и счётчики под ключом `tlc-companion-v1:{userId}` в `localStorage`. [lab-companion.tsx](./lab-companion.tsx)

## Verification

- Из корня репозитория запустите `npm test`.

## Cloud synchronization and storage

- `AccountWorkspaceProvider` combines workspace sections (`settings`, `layout`, `board`) and per-program records into the existing UI context. The `projects` value is an in-memory compatibility snapshot, not a database array section. Both stores refresh on focus, visible return, reconnect and every 10 seconds while visible.
- `project-sync.ts` reads paginated program metadata from `/api/projects`; it fetches payloads only for changed records through `/api/projects/[projectId]` and saves only dirty programs. Each `account_projects` row has an owner, revision and deletion tombstone. Three-way comparisons preserve unrelated programs and refuse conflicting edits or stale resurrection. The size guard is 3.5 MB per program, with no shared library guard.
- `project-journal.ts` commits program recovery/editor payloads to IndexedDB (`tlc-project-journal-v1`), outside localStorage's small quota. Cloud writes wait for successful recovery persistence; failed transactions do not report a saved program. Atomic editor generation checks prevent an older acknowledgement from removing newer queued edits. New drafts preserve only the target program/base; old localStorage drafts remain readable. Optional small-program cache is bounded to 500 KB per account and import plans retain hashes/IDs instead of entire source libraries.
- Workspace sections retain revision-protected serialized writes and merge independent entities. Notes and editor sessions do not silently replace dirty content. Normalized coordinates may have different pixel positions on different screen sizes. Guest projects and images remain local to the browser.
- `workspace-media` is a private bucket with owner-only immutable image paths. Authenticated uploads use validated JPEG/PNG/WebP files (2 MB decoded maximum) addressed by SHA256. Stable `/api/workspace-media/<hash>.<ext>` references require the current owner and return `private, no-store`; expiring access URLs are never persisted. Guest data URLs and external HTTPS board images still work.
- `/api/workspace-media/migrate` uploads embedded account images and replaces a complete section only after successful uploads and its revision check. Failures preserve the original section; deterministic paths make retries idempotent. Initial conversion finishes before editing is enabled; remaining failures are reported and retried. Replaced/orphan files are intentionally retained; future garbage collection must check references and pending writes.

## Release of separate storage

1. Apply `20261124073128_account_projects.sql`: it locks the legacy workspace table during backfill, validates source records, copies each program without dropping fields and freezes the old arrays as backups. Older clients must reload instead of continuing to save to a second store.
2. Apply `20261124073156_workspace_media.sql`: creates the private image bucket and owner policies.
3. Deploy the API/client together. New workspace requests skip frozen program arrays via `X-TLC-Program-Storage: records`.
4. Check two authenticated devices: distinct program changes, same-program conflict, delete while another editor is stale, reconnect recovery, new images/wallpapers, old-image conversion and account switching. Do not delete frozen program backups or orphan images as part of deployment.

Verify the hosted migration state before release. SQL backfill/RLS/CAS/rollback checks ran on isolated PostgreSQL/PGlite. Native IndexedDB was checked in a separate browser fixture; authenticated production behavior requires the release check.

## Verification

`npm test` includes workspace, per-program, journal and media regressions. Run `npx tsc --noEmit` and `npm run build` before release. Browser/dev sessions should be stopped after verification.
