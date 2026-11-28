# Звук

## Overview

Звуки блока «Звук». Их играет динамик хаба SPIKE Prime, а не планшет. Динамик умеет только тоны, поэтому записи с микрофона не поддерживаются.

## Interface

- `SOUND_PRESETS`, `soundSteps` и `presetSeconds` описывают звуки нотами и делят их на тоны. Новый звук добавляется в [public/sound-presets.js](../../../public/sound-presets.js). [presets.ts](./presets.ts)
- Пульт играет звук командами `n,<частота>,<мс>,<громкость>`: их по очереди шлёт [controller-runtime.ts](../controller-runtime.ts), исполняет [hub_program.py](../../../public/hub_program.py).
- Библиотека и прослушивание на роботе: [components/sound](../../components/sound/sound-library.tsx).

## Invariants

- Динамик один: новый звук прерывает предыдущий; повторный запуск уже играющего звука его не перебивает.
- Тоны не заменяют сигнал связи `k` и сами не включают контроль связи на хабе.
- Хаб не блокирует цикл команд: тон запускается без ожидания и выключается по таймеру.
- В пробном режиме без робота звука нет.
- Экспорт Pybricks играет звук на SPIKE до конца; на EV3 ставит `pass`.

## Verification

`npm test` из корня репозитория (`tests/sound.test.ts`, `tests/test_controller_hub.py`). Слышимость проверяется на настоящем хабе.
