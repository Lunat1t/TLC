# Каталог и чтение инструкций

## Overview

Клиентские компоненты показывают карточки инструкций, форму правки карточки и PDF с постраничным чтением.

## Interface

- `InstructionCatalogCards` принимает `CatalogCard[]` и открывает выбранную карточку с действиями чтения, скачивания и редактирования. [instruction-catalog-cards.tsx](./instruction-catalog-cards.tsx)
- `PdfReader` принимает `slug` и `title`, показывает страницу PDF и переключатели страницы и масштаба. [pdf-reader.tsx](./pdf-reader.tsx)

## Invariants

- `InstructionCatalogCards` показывает действие редактирования после готовности `useAccess` при `canPublish`. Для обложки приоритет имеет `coverAssetId`, затем превью PDF при `hasPdf`. [instruction-catalog-cards.tsx](./instruction-catalog-cards.tsx)
- `PdfReader` ограничивает сохранённый и вводимый номер страницы диапазоном от 1 до `numPages`, а коэффициент плотности canvas ограничивает значением 2. [pdf-reader.tsx](./pdf-reader.tsx)

## Side Effects

- `editCard` читает данные карточки через `GET /api/admin/instructions/{id}`. `saveCard` отправляет форму через `PATCH` на тот же адрес и вызывает `router.refresh()` после успеха. [instruction-catalog-cards.tsx](./instruction-catalog-cards.tsx)
- `PdfReader` загружает PDF с `/api/instructions/{slug}/document` через PDF.js и рендерит его на canvas. Номер страницы хранится в `localStorage` под ключом `tlc-pdf-page:{slug}`. При очистке эффектов отменяются загрузка и рендер. [pdf-reader.tsx](./pdf-reader.tsx)

## Verification

- Из корня репозитория запустите `npm test`.
