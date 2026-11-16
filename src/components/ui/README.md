# Общие компоненты интерфейса

## Overview

Базовые элементы предоставляют оформление нативных HTML-элементов. `CircleMenu` отображает круговое меню, а `LiveOrb` рисует анимированный орб.

## Interface

- `Button`, `ButtonProps`, `buttonVariants`, `Badge`, `BadgeProps` и `badgeVariants` предоставляют стили кнопок и меток. `Input` и `Label` оформляют поля и подписи. [button.tsx](./button.tsx) · [badge.tsx](./badge.tsx) · [input.tsx](./input.tsx) · [label.tsx](./label.tsx)
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` и `CardFooter` составляют карточку из обёрток с передачей ссылок на DOM. [card.tsx](./card.tsx)
- `CircleMenu` принимает элементы с подписью, иконкой и действием `onSelect`, а также `defaultOpen`, `onClose` и иконки переключателя. [circle-menu.tsx](./circle-menu.tsx)
- `LiveOrb` принимает `LiveOrbProps` для варианта, цветов, взгляда, моргания и выражения. Модуль экспортирует `LiveOrbVariant`, `AvatarPreset`, `AVATAR_PRESETS`, `WHITE`, `BLACK`, `CUSTOM_DEFAULT`, `WEBGL_COLORS`, `resolveOrbConfig` и `hexToRgb`. За SVG-лицо отвечают `OrbExpressionFace`, `OrbExpressionId`, `ORB_EXPRESSIONS` и `DEFAULT_ORB_EXPRESSION`. [live-orb.tsx](./live-orb.tsx)

## Invariants

- `MenuItem` отключает действия и выводит их из порядка клавиатурного фокуса, пока меню закрыто. `CircleMenu` учитывает предпочтение уменьшенного движения при закрытии. [circle-menu.tsx](./circle-menu.tsx)
- `resolveOrbConfig` для вариантов `custom` и `webgl` берёт первые три цвета переданной палитры, если их три или больше. При меньшем количестве использует встроенную палитру. `LiveOrb` использует заданное `lookOverride` раньше автоматического или интерактивного взгляда. [live-orb.tsx](./live-orb.tsx)

## Side Effects

- `CircleMenu` запускает анимацию открытия и закрытия, возвращает фокус кнопке при закрытии и вызывает `onClose`. [circle-menu.tsx](./circle-menu.tsx)
- `LiveOrb` создаёт графический контекст WebGL с попыткой использовать 2D canvas при его отсутствии. Рисует в цикле кадров и отслеживает движение указателя и изменение размеров окна. При очистке эффекта останавливает цикл и снимает слушатели. [live-orb.tsx](./live-orb.tsx)

## Verification

- Из корня репозитория запустите `npm test`.
