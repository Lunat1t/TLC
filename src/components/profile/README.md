# Аватар и достижения

## Overview

Компоненты отображают аватар Darwin V3, дают выбрать его цвета и показывают доступный аксессуар и уведомление о достижении Mix and Match.

## Interface

- `AvatarDarwinV3` рисует SVG и принимает цвета, стили, параметры вида, ссылки на элементы для анимации и вложенную графику. Модуль экспортирует `DARWIN_V3_BODY_PATH`, `AVATAR_SKINS` и типы `AvatarSkinId`, `AvatarEyeStyle`, `AvatarHeadStyle`, `AvatarChestStyle`. [avatar-darwin-v3.tsx](./avatar-darwin-v3.tsx)
- `AvatarEditor` принимает `initialAvatar` и управляет цветами тела и глаз и состоянием аксессуара. `MixMatchAccessoryArt` рисует аксессуар как группу SVG с необязательным преобразованием. [avatar-editor.tsx](./avatar-editor.tsx) · [mix-match-accessory-art.tsx](./mix-match-accessory-art.tsx)
- `useAvatarMotion` возвращает `characterRef`, `gazeRef` и `eyelidsRef` для привязки слежения за указателем и моргания. `AchievementNotifier` показывает уведомление о полученной награде. [use-avatar-motion.ts](./use-avatar-motion.ts) · [achievement-notifier.tsx](./achievement-notifier.tsx)

## Invariants

- `AvatarDarwinV3` использует уникальную маску SVG на экземпляр. По умолчанию выбирает скин `sky` и белые глаза формы `classic`. [avatar-darwin-v3.tsx](./avatar-darwin-v3.tsx)
- `AvatarEditor` применяет цвета сразу и ставит запись в последовательную очередь после паузы 250 мс. `persistAvatar` объединяет цвета с текущим аватаром и удаляет старые поля `eyeExpression` и `mouthExpression`. Вкладка аксессуара появляется при `accessory_unlocked === true`. [avatar-editor.tsx](./avatar-editor.tsx)
- `useAvatarMotion` приостанавливает отслеживание указателя и моргание для скрытой вкладки или при предпочтении уменьшенного движения. `AchievementNotifier` показывает только награду с ключом `mix_and_match_2025_2026`. [use-avatar-motion.ts](./use-avatar-motion.ts) · [achievement-notifier.tsx](./achievement-notifier.tsx)

## Side Effects

- `persistAvatar` читает и обновляет `profiles.avatar` текущего пользователя, затем обновляет контекст профиля и метаданные аккаунта. `AvatarEditor` использует RPC `get_my_mix_match_wardrobe` и `set_my_mix_match_accessory` для гардероба. [avatar-editor.tsx](./avatar-editor.tsx)
- `AchievementNotifier` читает `student_achievement_awards` и подписывается на `INSERT` с фильтром по `student_id`. Для просмотра прошлых наград учитывает отметку `tlc.achievement-seen.{id}` в `sessionStorage`. [achievement-notifier.tsx](./achievement-notifier.tsx)
- `useAvatarMotion` обновляет SVG через DOM, подписывается на указатель, видимость вкладки и настройки движения. При размонтировании снимает слушатели, отменяет таймеры, кадр и анимацию моргания. [use-avatar-motion.ts](./use-avatar-motion.ts)

## Verification

- Из корня репозитория запустите `npm test`.
