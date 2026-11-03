# Contracts: единый редактор и выполнение

## UI и маршрут

- Канонический маршрут проекта: `/editor?id=<encoded-project-id>` — соответствует текущему чтению `searchParams.get("id")`.
- `/controller.html?project=<id>` перенаправляется на `/editor?id=<id>`; сервер не возвращает отдельный пульт. Параметры преобразуются с URL encoding, без интерполяции HTML или доверия произвольному пути.
- `/controller.html` без проекта направляет в список проектов `/`; неизвестный ID в редакторе показывает сообщение и список проектов для явного выбора без автостарта. Редирект не соединяется с хабом и не запускает программу.
- В шапке редактора доступны «Редактирование / Проверка», Bluetooth, запуск программы хаба, «Старт программы», «Стоп», отключение и скачивание программы хаба. Состояние транспорта и состояние ученической программы отображаются раздельно понятными подписями.
- Панель палитры «Управление»: область, Drivetrain, мотор, связанные моторы, шапки нажатия/отпускания. Скорость добавляется только в меню модулей моторного блока.
- В edit drag/resize не порождают pressed/released и не отправляют команды. В check раскладка зафиксирована; действие не имеет отдельной автоматической привязки к мотору.
- Pointer capture гарантирует release за пределами кнопки; pointercancel вызывает общий stop. Keyboard repeat игнорируется; при вводе текста, select, диалоге или фокусе вне управления клавиши не захватываются. Конфликт keyBindings диагностируется, одно нажатие не адресует несколько controls.
- Изменение имени/размера не меняет ID. Ошибка хотя бы одного события кнопки сразу показывает на ней значок и понятную доступную подсказку и блокирует эту кнопку; исправные кнопки продолжают работать. Для удалённой цели ошибка остаётся у шапки и в списке ошибок, с выбором существующего элемента. Нет автоматического назначения «первого» управления. После отпускания непрерывное движение не останавливается без явно заданного события или общего стопа.

## Чистые интерфейсы (проектируемые)

```text
validateControlLayout(raw, sheets) -> { layout, diagnostics }
migrateControlWorkspace(project) -> { project, changed, backupRequired, diagnostics }
compileControllerProgram(projectSnapshot) -> CompiledProgram
findHandler(program, target, event) -> handler | null
commandsFor(action, protocol) -> command[] | diagnostic
```

Компилятор не обращается к DOM, localStorage, BLE или сети. `revision` меняется при любом изменении исполняемого снимка. Названия в диагностике берутся из snapshot; ID источника позволяет подсветить блок. Ошибки: `missing-control`, `invalid-input`, `duplicate-handler`, `multiple-start`, `unsupported-block`, `invalid-port`, `same-ports`, `speed-and-power`, `power-travel`, `too-many-actions`, `unsupported-layout-version`, `missing-port`, `protocol-upgrade`. Диагностика сообщает scope и severity по [data-model.md](../data-model.md).

## Сервис сессии (проектируемый)

```text
createControllerSession(transport, clock) -> session
session.subscribe(listener) -> unsubscribe
session.connect() -> Promise<void>            // из прямого жеста пользователя
session.startHub() -> Promise<void>           // запуск Pybricks, ожидание READY
session.startProgram(snapshot) -> Promise<void>
session.dispatch(target, pressed|released) -> Promise<void>
session.stop(reason) -> Promise<void>
session.disconnect() -> Promise<void>
session.dispose() -> Promise<void>           // идемпотентен
```

Connect/StartHub не равны StartProgram. StartProgram без READY запускает trial. При READY в trial необходимо снова явно нажать старт для live; startup не повторяется от notification/рендера. Глобальные ошибки и startup ошибки блокируют старт; ошибки handler блокируют конкретную цель. Проверка доступных портов и протокола выполняется до live-цепочки, при несовместимости startup live-старт блокируется.

Один session на редактор, очищаемый при unmount, включая React Strict Mode. При stop до `x` отменить очередь и heartbeat; после успешной записи ждать существующее `SOCER2_STOP` до 1200 мс. Только один stop в полёте, повторные запросы объединяются; таймаут, сбой и потеря связи переводят в fault, закрывают соединение и показывают, что остановка не подтверждена. Восстановление требует нового подключения, READY и явного старта; старые callbacks и запоздалые ответы не относятся к новому соединению. Периодический `SOCER2_ACK` не является подтверждением stop. Без heartbeat watchdog хаба является резервом, но механическую остановку не следует объявлять подтверждённой.

Один session на редактор, очищаемый при unmount, включая React Strict Mode. После dispose callbacks не меняют состояние и не пишут характеристику. Переход edit/project/sheet сначала вызывает stop. Очередь команд не может переносить действия предыдущего epoch в новую сессию. Владение портом проверяется перед каждой отложенной моторной командой и stop. Stop получает приоритет перед ещё не отправленными действиями.

Стоп и потеря связи очищают heldInputs, abort всех runners, инвалидируют snapshot для выполнения, отменяют ожидания и pending queued writes. После этого для движения требуется новый явный старт. Старый renderer не используется как iframe или script внутри React.

## Wire protocol (сохраняется)

| Вход/выход | Назначение |
| --- | --- |
| h / SOCER2_READY или SOCER3_READY с перечнем портов | handshake и действительные моторы |
| k / ACK | heartbeat, проверка связи |
| x | общий аварийный стоп |
| m,port,speed | непрерывная скорость; ноль останавливает |
| d,port,power | мощность v3 |
| a,port,speed,degrees | угловое движение v3 |
| t,port,speed,ms | движение по времени v3 |
| LINK_LOST / остановка программы | ошибка сессии и общий stop |

Точные фреймы и line endings сохраняются из `commandsFor` и `public/hub_program.py`; этот план не вводит новый wire protocol. Heartbeat клиента примерно 150 мс, ACK timeout 1800 мс, write timeout 1200 мс. Watchdog хаба 600 мс отсчитывается от последнего входящего пакета и не равен ACK timeout. При транспортной ошибке не продолжать heartbeat как доказательство готовности ученической программы.

## Persistence и удаление

Проект сохраняет layout, event targets и motor modules одной записью в существующем хранилище. До readSheets/autosave построить миграцию в памяти, сохранить и перечитать backup точного raw общего ключа и под Web Lock сверить исходник перед единственным setItem; при ошибке, конфликте или отсутствии безопасной блокировки запретить запись, сохранить исходник и предложить JSON-экспорт. Старые вкладки без поддержки lock не гарантируют изоляцию; backup остаётся доступным. Прямой вызов старого layout API не требуется для программирования проекта; текущий API остаётся совместимым для чтения старой конфигурации.

Удалить `public/controller.html`, `public/controller.js`, `public/controller.css` после переноса используемых частей. Сохранить общий компилятор, transport helpers и программу хаба. Обновить ссылки в `src/app/editor/page.tsx`, `src/app/page.tsx`, `public/manifest.webmanifest`, README и UI-тестах. Исходные старые настройки не удалять вместе с UI.
