# Data Model: Программа пульта из блоков

## WorkspaceBlock (расширение `src/lib/workspace.ts`)

`BlockType` = `"start" | "drive" | "pair" | "if" | "button" | "stop"`.

| Поле | Тип | Для | Правило |
| --- | --- | --- | --- |
| `button` | `ControllerButton` | `button` | одно из 10 значений, по умолчанию `"up"` |
| `event` | `"pressed" \| "released"` | `button` | по умолчанию `"pressed"` |
| `motor` | порт | `stop` | порт хаба проекта, по умолчанию `"A"` |
| `motor2` | порт \| нет | `stop` | необязателен, ≠ `motor` |

Остальные поля `drive`/`pair` не меняются. Старые проекты читаются без изменений: неизвестные поля отбрасываются, как сейчас в `readBlocks`.

Правила связей:
- `button` — только корень цепочки (нет `parentId`); к нему нельзя прикрепить сверху.
- Цепочка под `button`: только `drive`, `pair`, `stop`. `if`, `start`, `button` под шапкой — ошибка проверки, при перетаскивании редактор не подсвечивает такой слот.
- `stop` допустим и в автономной программе (генерирует `brake()`), но его основная роль — пульт.
- `generatePybricks` пропускает цепочки с корнем `button` (SC-005).

`ControllerButton` = `"up" | "down" | "left" | "right" | "a" | "b" | "x" | "y" | "l" | "r"`.

## ControllerProgram (результат `compileControllerProgram`)

```text
ControllerProgram {
  projectId: string
  projectName: string
  hub: "spike"
  protocol: 2 | 3            // максимальная версия, нужная хотя бы одному обработчику
  ports: Port[]              // все используемые порты, сортированы
  handlers: Handler[]        // не более 20, по одному на пару (button, event)
  errors: ProgramError[]     // пусто → программа исполняема
}
Handler { button: ControllerButton; event: "pressed"|"released"; sourceBlockId: string; actions: Action[] }
Action =
  | { kind: "run";   port; speed: -1000..1000 }               // непрерывно, m
  | { kind: "dc";    port; power: -100..100 }                 // непрерывно, d (v3)
  | { kind: "angle"; port; speed: 1..1000 signed; degrees: 1..3_600_000 } // a (v3)
  | { kind: "time";  port; speed signed; ms: 1..600_000 }     // t (v3)
  | { kind: "dcTime"; port; power signed; ms }                // d + ожидание + стоп (v3)
  | { kind: "stop";  port }                                   // m,port,0
  | { kind: "wait";  ms }                                     // вставляется после time/angle
ProgramError { button?: ControllerButton; blockId?: string; code: string; message: string }  // message — по-русски, ≤ 120 символов
```

Блок `pair` превращается в два действия подряд без ожидания между ними, затем одно `wait`.

Правила компиляции и ошибки:
| code | Условие |
| --- | --- |
| `unsupported-hub` | проект `ev3` |
| `duplicate-handler` | две шапки с одинаковыми `button` + `event` (обе подсвечиваются) |
| `bad-child` | `if`/`start`/`button` в цепочке шапки |
| `speed-and-power` | одновременно модули скорости и мощности |
| `power-travel` | мощность с оборотами/градусами |
| `same-ports` | `pair` или `stop` с одинаковыми портами |
| `empty-handler` | шапка без действий — предупреждение, не блокирует |
| `too-many-actions` | больше 50 действий в обработчике |

## Runtime state (страница пульта, в памяти)

```text
mode: "trial" | "live"        // live только при ready && connected
hubProtocol: 2 | 3 | null     // из SOCER2_/SOCER3_READY
availablePorts: Set<Port>
running: Map<handlerKey, AbortController>
pressedButtons: Set<ControllerButton>
log: LogEntry[≤ 30]           // { time, button, event, text, level: "info"|"warn" }
```

Переходы:
- `trial → live`: READY получен и соединение активно. Перед каждым обработчиком пульт проверяет его порты и команды. Несовместимый обработчик блокируется с ошибкой; совместимые обработчики продолжают работать, в том числе непрерывные команды на v2.
- `live → trial`: Стоп-события FR-009; перед переходом — abort всех `running`, `x\n`, все порты в 0.
- Смена/обновление проекта: abort всех, стоп, перекомпиляция.

Ошибки выполнения: `missing-port` при отсутствии порта обработчика в READY; `protocol-upgrade` для `dc`, `angle`, `time`, `dcTime` или скорости выше 600°/с на v2. Эти ошибки относятся к кнопке обработчика.

## Удаляемые из UI (данные сохраняются)

`config.devices`, `moduleLayout`, `gamepad`, `controls`, `ports` из `tlc.controller-layout.v1` и профиля больше не читаются пультом. Ключ и `/api/controller-layout` остаются для отката.
