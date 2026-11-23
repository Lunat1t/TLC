# Компоненты профиля

## Overview

Визуальные SVG-примитивы для отображения аватара и серии дней обучения.

## Interface

- `AvatarDarwinV3` рисует SVG-аватар и принимает цвета, стили, параметры вида, ссылки на элементы для анимации и вложенную графику. Модуль экспортирует `DARWIN_V3_BODY_PATH`, `AVATAR_SKINS` и типы `AvatarSkinId`, `AvatarEyeStyle`, `AvatarHeadStyle`, `AvatarChestStyle`. [avatar-darwin-v3.tsx](./avatar-darwin-v3.tsx)
- `StreakFlame` рисует пламя серии обучения с выбором размера, палитры и приглушённого состояния. [streak-flame.tsx](./streak-flame.tsx)

## Invariants

- `AvatarDarwinV3` использует уникальную маску SVG на экземпляр. По умолчанию выбирает скин `sky` и белые глаза формы `classic`. [avatar-darwin-v3.tsx](./avatar-darwin-v3.tsx)

## Verification

- Из корня репозитория запустите `npm test`.
