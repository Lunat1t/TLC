# Компоненты редактора роботов

## Overview

Компоненты редактируют блоки и область пульта. Хук сессии подключает редактор к клиентской среде выполнения контроллера.

## Interface

- `ControllerButtonBlock` задаёт кнопку и событие `pressed` или `released`. `ControllerStopBlock` задаёт порт мотора для остановки. Оба принимают блок и передают изменения через `onChange`. [controller-blocks.tsx](./controller-blocks.tsx)
- `ModuleBar` рисует «таблетки» включённых модулей блока и меню «+». Один компонент обслуживает блоки «Мотор» и «Шасси»; набор модулей и правила берёт из реестра `@/lib/block-modules`. `ModuleCapsuleIconPopover` и `usePopoverDismiss` из того же файла используют и другие блоки. [module-bar.tsx](./module-bar.tsx)
- `ControlAreaView` отображает и редактирует область пульта и её элементы. При работе пульта передаёт события через `onInput` и `onCancel`. [control-area.tsx](./control-area.tsx)
- `useRobotSession` возвращает наблюдаемое состояние `state` и ссылку `ref` на сессию контроллера. [robot-session.tsx](./robot-session.tsx)

## Invariants

- `ControllerButtonBlock` использует пары `controlId` и `input`, если передан список `controls`. При смене элемента поле `input` сбрасывается. Без списка доступны прежние кнопки пульта. [controller-blocks.tsx](./controller-blocks.tsx)
- `ControlAreaView` отключает кнопки при редактировании и при ошибке конкретного входа. Перемещение и изменение размера элемента учитывают масштаб, границы области и пересечения с другими элементами. Компонент передаёт логические события, а отправкой команд управляет среда выполнения контроллера. [control-area.tsx](./control-area.tsx)

## Side Effects

- `ControlAreaView` захватывает указатель при перетаскивании, держит локальный предпросмотр и передаёт завершённые изменения вызывающему коду. [control-area.tsx](./control-area.tsx)
- `useRobotSession` создаёт сессию через `createControllerSession(createBluetoothTransport())`, подписывается на неё и освобождает при размонтировании. [robot-session.tsx](./robot-session.tsx)

## Verification

- Из корня репозитория запустите `npm test`. Набор включает симуляцию контроллера.
