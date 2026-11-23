# Компоненты TLC

## Overview

React-компоненты страниц TLC. Основная оболочка связывает состояние аккаунта, рабочее место, запуск приложения и навигацию. [src/app/layout.tsx](../app/layout.tsx)

## Interface

- `GoogleSignIn` показывает кнопку входа через Google и состояние доступности провайдера. [google-signin.tsx](./google-signin.tsx)
- Провайдер сессии и экран запуска описаны в [auth](./auth/README.md).
- Блоки, область пульта и сессия контроллера описаны в [editor](./editor/README.md).
- Карточки каталога и постраничный PDF описаны в [instructions](./instructions/README.md).
- Настройки аккаунта, доска, обои и напарник описаны в [lab](./lab/README.md).
- Оболочка и каталог приложений описаны в [navigation](./navigation/README.md).
- SVG-аватар и индикатор серии описаны в [profile](./profile/README.md).
- Базовые элементы, круговое меню и анимированный орб описаны в [ui](./ui/README.md).

## Invariants

- `GoogleSignIn` активирует кнопку только после ответа с `external.google === true` и блокирует её во время входа. [google-signin.tsx](./google-signin.tsx)
- `RootLayout` монтирует `AccessProvider` снаружи `AccountWorkspaceProvider`. Затем `AppStartup` оборачивает `StudentNavigation`. [src/app/layout.tsx](../app/layout.tsx)

## Side Effects

- `GoogleSignIn` запрашивает настройки Supabase по `/auth/v1/settings`. Нажатие запускает `signInWithOAuth` с провайдером `google` и возвратом на `/auth/callback` текущего сайта. [google-signin.tsx](./google-signin.tsx)

## Verification

- Из корня репозитория запустите `npm test`.
