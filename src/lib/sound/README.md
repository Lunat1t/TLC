# Звук

## Overview

Звуки для блока «Звук»: готовые звуки, записи ученика и их воспроизведение. Звук играет на устройстве, где открыт редактор, а не на хабе. Интерфейс библиотеки лежит в [components/sound](../../components/sound).

## Interface

- `SOUND_PRESETS` и `renderPreset` описывают готовые звуки нотами и считают из них отсчёты. Новый готовый звук добавляется в [public/sound-presets.js](../../../public/sound-presets.js). [presets.ts](./presets.ts)
- `mixToMono`, `resample`, `normalizePeak`, `encodeWav` обрабатывают отсчёты и собирают WAV. [wav.ts](./wav.ts)
- `soundLibrary` отдаёт список, данные, добавление, переименование и удаление. Хранилище заменяемое: `createSoundLibrary(memoryRecordingStore())`. [library.ts](./library.ts)
- `startRecording` пишет с микрофона и возвращает WAV. [recorder.ts](./recorder.ts)
- `soundPlayer` играет звуки запущенной программы; `unlock` вызывается из обработчика нажатия. [player.ts](./player.ts)

## Invariants

- Идентификатор начинается с `preset:` или `rec:`. Блок хранит только `soundId`.
- Запись — моно WAV 22050 Гц, не длиннее 30 секунд. В библиотеке не больше 50 записей.
- Записи не синхронизируются с аккаунтом: на другом устройстве блок показывает «Звук не найден», а программа пишет предупреждение в журнал и идёт дальше.
- Один и тот же звук играет в одном экземпляре. Остановка программы глушит все звуки.
- Экспорт Pybricks заменяет блок на `pass` с комментарием.

## Side Effects

- Записи хранятся в IndexedDB `tlc-sounds`.
- `startRecording` запрашивает микрофон и работает только по HTTPS или на `localhost`.

## Verification

`npm test` из корня репозитория (`tests/sound.test.ts`). Микрофон и воспроизведение проверяются в браузере.
