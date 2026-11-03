# Contract: программа пульта, страница пульта и протокол хаба

## 1. Модуль `public/controller-program.js`

```text
export const CONTROLLER_BUTTONS: readonly ControllerButton[]   // порядок отображения
export const BUTTON_LABELS: Record<ControllerButton, string>  // "▲", "▼", "◀", "▶", "A", "B", "X", "Y", "L", "R"
export const BUTTON_KEYS: Record<string, ControllerButton>     // ArrowUp→up … KeyJ→a, KeyK→b, KeyU→x, KeyI→y, KeyQ→l, KeyE→r
export function compileControllerProgram(project: unknown): ControllerProgram   // никогда не бросает
export function describeAction(action: Action): string        // "Мотор A вперёд 360°/с"
export function commandsFor(action: Action, protocol: 2|3): string[]  // строки с "\n", бросает при неподдерживаемом
export function controllerHandler(program: ControllerProgram, button: ControllerButton, event: "pressed"|"released"): Handler|null
export function controllerRuntimeErrors(program: ControllerProgram, protocol: 2|3, ports: Set<Port>): ProgramError[]
```

Детерминирован, без DOM и сети; один и тот же вход → один и тот же выход (тесты).

## 2. Протокол хаба (stdin строки ≤ 50 ASCII, `\n`)

| Команда | v2 | v3 | Действие на хабе |
| --- | --- | --- | --- |
| `h` | ✓ | ✓ | печатает READY |
| `k` | ✓ | ✓ | heartbeat |
| `x` | ✓ | ✓ | стоп всех, `SOCER2_STOP` |
| `m,P,S` | ✓ (±600) | ✓ (±1000) | `run(S)` или `brake()` при 0 |
| `d,P,W` | — | ✓ (±100) | `dc(W)`; 0 → `brake()` |
| `a,P,S,D` | — | ✓ | `run_angle(S, D, then=Stop.BRAKE, wait=False)` |
| `t,P,S,MS` | — | ✓ | `run_time(S, MS, then=Stop.BRAKE, wait=False)` |

Ответы: `SOCER3_READY|A,B,…` (v3) или `SOCER2_READY|…` (v2), `SOCER2_ACK`, `SOCER2_LINK_LOST`, `SOCER2_NO_MOTORS`, `SOCER2_STOP`. Неверные строки игнорируются. Таймаут 600 мс без `k`/команд → стоп всех. Любая команда для порта отменяет предыдущее движение этого порта.

## 3. Страница пульта (`public/controller.html`)

Верхняя панель (порядок): бренд · статус · выбор проекта `#project` · `↻` `#reload` · `✎ В редакторе` (ссылка `/editor?id=<id>` — существующий параметр редактора) · `Bluetooth` · `▶ Старт` · `■ Стоп` · `↓ Программа хаба` · `Отключить` (после подключения).

Поле:
- `#gamepad` — 10 кнопок `button.control-button[data-button=<id>]`, `aria-label="Кнопка ▲"`, `aria-pressed` при удержании, `data-has-handler="true|false"`, подсказка клавиши `<kbd>`.
- `#modeBadge` — «Пробный режим · без робота» / «Робот управляется».
- `#programErrors` — список ошибок с `Открыть в редакторе`; при ошибках кнопки с ошибочными обработчиками приглушены и не исполняются, остальные работают.
- `#eventLog` (`role="log"`, `aria-live="polite"`) — последние 30 событий.

Запрещено на странице: `#edit`, `#editor`, `#modulePicker`, `#hub`, `#speedList`, перетаскивание/изменение размера элементов.

Поведение:
- `pointerdown`/`keydown` → `pressed`; `pointerup`/`pointercancel`/`lostpointercapture`/`keyup`/`blur` → `released`. Автоповтор клавиш игнорируется.
- `trial`: лента + подсветка, ноль BLE-записей моторов.
- `live`: команды через существующую очередь `writeBytes`; heartbeat 150 мс и проверка ACK 1800 мс без изменений.
- Ошибка записи → `disconnect()`; все остановки по FR-009 отправляют `x\n` и прерывают цепочки.
- После READY несовместимые с портами/версией обработчики блокируются и получают отдельные сообщения; совместимые обработчики продолжают работать. «Стоп» снимает READY до следующего запуска.

## 4. Редактор (`src/app/editor/page.tsx`)

- Категория «Пульт» под «Основные»: «Когда кнопка… нажата», «Когда кнопка… отпущена», «Стоп мотора», шаблон «Держи — едет» (добавляет две шапки с действием и стопом).
- На шапке: выпадающий список кнопки (символ + название), переключатель нажата/отпущена; на «Стоп мотора» — порт(ы).
- Ошибки `compileControllerProgram` подсвечивают блок так же, как текущие ошибки генерации.
- Кнопка «Пульт» в шапке: сохранить проект → открыть `/controller.html?project=<id>` в той же вкладке (или новой при `Ctrl/Cmd`).
