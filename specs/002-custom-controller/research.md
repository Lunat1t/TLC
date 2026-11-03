# Research

## BLE обнаружение и запуск

**Decision:** искать Pybricks по service UUID `c5f50001-8280-46da-89f4-6d8051e4aeef`, запускать установленную программу командой BLE `0x01`, передавать stdin пакетами `0x06`, ждать вывода и состояния.
**Rationale:** официальный BLE профиль не зависит от имени устройства.
**Alternatives considered:** фильтр имени несовместим с переименованием; загрузка программы через отдельный BLE протокол оставлена Pybricks Code.
**Source:** [Pybricks BLE profile](https://github.com/pybricks/technical-info/blob/master/pybricks-ble-profile.md).

## Программа хаба

**Decision:** создавать Motor для выбранных Powered Up портов без PrimeHub; принимать команды каждого порта; останавливать все моторы при таймауте 600 мс.
**Rationale:** старая программа была привязана к PrimeHub и двум моторам. `Motor.run` и `brake` подходят для независимых портов.
**Alternatives considered:** DriveBase не подходит для произвольных моторов; EV3 имеет другой путь подключения.
**Sources:** [Pybricks hubs](https://docs.pybricks.com/en/stable/hubs/index.html), [Motor API](https://docs.pybricks.com/en/latest/pupdevices/motor.html).

## Сохранение

**Decision:** один JSON профиль в Supabase Auth user metadata, проверка сессии и данных в Next API, локальная копия.
**Rationale:** авторизация сайта уже использует Supabase Auth; миграция таблицы не требуется, а старый пульт хранил данные только на устройстве.
**Alternatives considered:** только localStorage не переносит профиль между устройствами; публичный API без сессии не защищает раскладки.
