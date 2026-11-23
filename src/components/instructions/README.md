# Каталог и чтение инструкций

## Overview

Клиентские компоненты показывают карточки инструкций, форму правки карточки и PDF с постраничным чтением.

## Interface

- `InstructionCatalogCards` принимает `CatalogCard[]` и открывает выбранную карточку с действиями чтения, скачивания и редактирования. [instruction-catalog-cards.tsx](./instruction-catalog-cards.tsx)
- `PdfReader` принимает `slug`, `title`, опциональные `kit` и `initialUserId`, поддерживает поворот 90°, зум, полноэкранный режим, предрендер `±1` страницы, свайпы/клавиатуру, ползунок и переход на `/map` и `/editor` на последней странице. [pdf-reader.tsx](./pdf-reader.tsx)

## Invariants

- `InstructionCatalogCards` показывает действие редактирования после готовности `useAccess` при `canPublish`. Для обложки приоритет имеет `coverAssetId`, затем превью PDF при `hasPdf`. [instruction-catalog-cards.tsx](./instruction-catalog-cards.tsx)
- `PdfReader` изолирует номер страницы, поворот и локальный кэш PDF в IndexedDB по `userId` (или `"anon"`), перепроверяет доступ по рангу перед выдачей из кэша и ограничивает коэффициент плотности canvas значением 2. [pdf-reader.tsx](./pdf-reader.tsx) · [reader-storage.ts](../../lib/instructions/reader-storage.ts)

## Side Effects

- `editCard` читает данные карточки через `GET /api/admin/instructions/{id}`. `saveCard` отправляет форму через `PATCH` на тот же адрес и вызывает `router.refresh()` после успеха. [instruction-catalog-cards.tsx](./instruction-catalog-cards.tsx)
- `PdfReader` загружает PDF с `/api/instructions/{slug}/document` с поддержкой HTTP Range (`206`) и кэширует байты в IndexedDB под ключом `{userId}:{slug}`. Состояние чтения хранится в `localStorage` под ключом `tlc-pdf-state:v1:{userId}:{slug}`. [pdf-reader.tsx](./pdf-reader.tsx)

## Verification

- Из корня репозитория запустите `npm test`.
