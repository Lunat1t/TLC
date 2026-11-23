# Навигация TLC

## Overview

Оболочка применяет настройки рабочего места к страницам TLC, показывает панель навигации и открывает каталог приложений.

## Interface

- `StudentNavigation` принимает содержимое страницы через `children`. Оболочка читает текущий маршрут, состояние доступа и настройки рабочего места. [student-navigation.tsx](./student-navigation.tsx)
- `AppLauncher` принимает список `apps` с маршрутом, названием, иконкой и цветом. Поиск фильтрует список по названию. [app-launcher.tsx](./app-launcher.tsx)

## Invariants

- `StudentNavigation` добавляет в каталог инструкции для ученика или учителя, а также публикацию и настройку роадмапа при `canPublish`. [student-navigation.tsx](./student-navigation.tsx)
- `AppLauncher` закрывается при смене маршрута, выборе пункта и по Escape. Новый клик по кнопке каталога сбрасывает поисковую строку. [app-launcher.tsx](./app-launcher.tsx)

## Side Effects

- `AppLauncher` монтирует панель через портал в `document.body` и держит слушатель клавиатуры, пока она открыта. [app-launcher.tsx](./app-launcher.tsx)
- `StudentNavigation` запрашивает предварительную загрузку `/dashboard` при наведении или фокусе на ссылке главного экрана. [student-navigation.tsx](./student-navigation.tsx)

## Verification

- Из корня репозитория запустите `npm test`.
