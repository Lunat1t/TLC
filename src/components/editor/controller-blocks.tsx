import React from "react"
import { Settings2, AlertTriangle } from "lucide-react"
import type { WorkspaceBlock, ControllerButton, ControllerEvent, ChassisDirection } from "@/lib/workspace"
import { CONTROLLER_BUTTONS, BUTTON_LABELS } from "@/lib/controller-program"
import { INPUT_ICONS, formatControlOptionLabel, getStopPorts } from "@/lib/block-registry"
import { CONTROL_INPUTS, type ControlInstance } from "@/lib/control-workspace"

interface ControllerBlockProps {
  block: WorkspaceBlock
  ports: string[]
  isConnected: boolean
  hasChild: boolean
  errorMessage?: string
  controls?: ControlInstance[]
  sheetControlIds?: ReadonlySet<string>
  onChange: (changes: Partial<WorkspaceBlock>) => void
}

const COMPACT_BUTTON_LABELS: Record<ControllerButton, string> = {
  up: "▲",
  down: "▼",
  left: "◀",
  right: "▶",
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  l: "L",
  r: "R",
  blue: "🔵",
  red: "🔴",
  green: "🟢",
  yellow: "🟡",
}

const BUTTON_ARIA_LABELS: Record<ControllerButton, string> = {
  up: "Вверх",
  down: "Вниз",
  left: "Влево",
  right: "Вправо",
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  l: "L",
  r: "R",
  blue: "Синяя",
  red: "Красная",
  green: "Зелёная",
  yellow: "Жёлтая",
}

export function BlockErrorBar({ errorMessage }: { errorMessage?: string }) {
  if (!errorMessage) return null
  return (
    <div
      role="alert"
      title={errorMessage}
      className="mx-3 mb-2 max-w-[320px] truncate whitespace-nowrap rounded-[7px] border border-[#fca5a5] bg-[#fef2f2] px-2.5 py-1 text-[11px] font-black text-[#991b1b] shadow-sm flex items-center gap-1.5"
    >
      <AlertTriangle size={12} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{errorMessage}</span>
    </div>
  )
}

export function ControllerButtonBlock({
  block,
  errorMessage,
  controls,
  sheetControlIds,
  onChange,
}: ControllerBlockProps) {
  const buttonControls = controls?.filter(control => (control.inputs || CONTROL_INPUTS[control.kind]).length > 0)
  const sheetButtonControls = React.useMemo(() => {
    if (!buttonControls) return []
    if (!sheetControlIds) return buttonControls
    return buttonControls.filter(control => sheetControlIds.has(control.id))
  }, [buttonControls, sheetControlIds])

  const singleSheetControl = sheetButtonControls.length === 1 ? sheetButtonControls[0] : null
  const hideControlSelect = Boolean(
    singleSheetControl && (!block.target?.controlId || block.target.controlId === singleSheetControl.id)
  )

  const currentButton = (block.button || "up") as ControllerButton
  const currentEvent: ControllerEvent =
    block.event === "hold" ? "hold" : block.event === "released" ? "released" : "pressed"

  const kindCounts = new Map<string, number>()
  if (buttonControls) {
    for (const control of buttonControls) {
      kindCounts.set(control.kind, (kindCounts.get(control.kind) || 0) + 1)
    }
  }
  const kindProgress = new Map<string, number>()
  const activeControlId = block.target?.controlId || singleSheetControl?.id || ""
  const selectedControl = buttonControls?.find(item => item.id === activeControlId) || singleSheetControl || undefined

  return (
    <div className="flex flex-col">
      <div className="flex flex-nowrap items-center min-h-[58px] px-3 gap-1.5 text-white">
        {buttonControls ? (
          <>
            {!hideControlSelect && (
              <select
                value={block.target?.controlId || ""}
                aria-label="Выбрать пульт"
                title="Пульт"
                onChange={e => {
                  const control = buttonControls.find(item => item.id === e.target.value)
                  onChange({
                    target: {
                      controlId: e.target.value,
                      input: control ? (control.inputs || CONTROL_INPUTS[control.kind])[0] || "" : "",
                    },
                  })
                }}
                className="min-h-[36px] h-[36px] max-w-[96px] shrink-0 px-2 rounded-[9px] bg-white text-[#18313b] font-black text-xs border-2 border-[#c2410c] cursor-pointer"
              >
                <option value="">Пульт</option>
                {block.target?.controlId && !selectedControl && (
                  <option value={block.target.controlId}>Удалён</option>
                )}
                {buttonControls.map(control => {
                  const idx = (kindProgress.get(control.kind) || 0) + 1
                  kindProgress.set(control.kind, idx)
                  return (
                    <option key={control.id} value={control.id}>
                      {formatControlOptionLabel(control, idx, kindCounts.get(control.kind) || 1)}
                    </option>
                  )
                })}
              </select>
            )}
            <select
              value={block.target?.input || ""}
              aria-label="Выбрать кнопку пульта"
              title="Кнопка"
              onChange={e => onChange({ target: { controlId: activeControlId, input: e.target.value } })}
              className="min-h-[36px] h-[36px] min-w-[52px] shrink-0 px-2 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#c2410c] cursor-pointer"
            >
              <option value="">•</option>
              {selectedControl
                ? (selectedControl.inputs || CONTROL_INPUTS[selectedControl.kind]).map(input => (
                    <option key={input} value={input}>
                      {INPUT_ICONS[input] || input.toUpperCase()}
                    </option>
                  ))
                : null}
            </select>
          </>
        ) : (
          <select
            value={currentButton}
            aria-label="Выбрать кнопку пульта"
            onChange={(e) => onChange({ button: e.target.value as ControllerButton })}
            className="min-h-[36px] h-[36px] shrink-0 px-2 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#c2410c] shadow-sm cursor-pointer"
          >
            {CONTROLLER_BUTTONS.map((btn) => (
              <option key={btn} value={btn} aria-label={BUTTON_ARIA_LABELS[btn]}>
                {COMPACT_BUTTON_LABELS[btn] || BUTTON_LABELS[btn]}
              </option>
            ))}
          </select>
        )}

        <select
          value={currentEvent}
          aria-label="Режим срабатывания кнопки"
          title="Режим кнопки"
          onChange={(e) => onChange({ event: e.target.value as ControllerEvent })}
          className="min-h-[36px] h-[36px] shrink-0 px-2 rounded-[9px] bg-white text-[#18313b] font-black text-xs border-2 border-[#c2410c] shadow-sm cursor-pointer hover:bg-[#fff7ed] transition-colors focus:outline-none"
        >
          <option value="hold">Пока нажата</option>
          <option value="pressed">Нажата</option>
          <option value="released">Отпущена</option>
        </select>
      </div>

      <BlockErrorBar errorMessage={errorMessage} />
    </div>
  )
}

export function ControllerStopBlock({
  block,
  ports,
  errorMessage,
  onChange,
}: ControllerBlockProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const stopInfo = getStopPorts(block)
  const isStopAll = stopInfo.stopAll
  const activePorts = isStopAll ? [] : stopInfo.ports
  const unusedPorts = ports.filter((p) => !activePorts.includes(p))

  React.useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [menuOpen])

  return (
    <div className="flex flex-col">
      <div className="flex flex-nowrap items-center min-h-[64px] px-4 gap-2 text-white">
        <span
          aria-hidden="true"
          className="w-[28px] h-[28px] shrink-0 rounded-[6px] bg-[#8f2a21] text-white font-black grid place-items-center text-sm shadow-inner"
        >
          ■
        </span>
        <span className="text-[15px] font-extrabold whitespace-nowrap tracking-tight">
          Стоп
        </span>

        {isStopAll ? (
          <div className="flex flex-nowrap items-center gap-1 min-h-[36px] h-[36px] px-2.5 rounded-[9px] bg-white text-[#18313b] font-black text-xs border-2 border-[#8f2a21] shrink-0">
            <span className="whitespace-nowrap">Все моторы</span>
            <button
              type="button"
              aria-label="Отменить остановку всех моторов"
              onClick={() => onChange({ stopAll: false, motors: [ports[0] || "A"], motor: ports[0] || "A" })}
              className="ml-1 w-[20px] h-[20px] rounded-full bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] text-xs leading-none grid place-items-center"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="flex flex-nowrap items-center gap-1.5 shrink-0">
            {activePorts.map((port, idx) => (
              <div key={`${idx}:${port}`} className="flex flex-nowrap items-center gap-1 shrink-0">
                <select
                  value={port}
                  aria-label={`Порт мотора ${idx + 1} для остановки`}
                  onChange={(e) => {
                    const next = [...activePorts]
                    next[idx] = e.target.value
                    onChange({ stopAll: false, motors: next, motor: next[0], motor2: next[1] })
                  }}
                  className="min-h-[36px] h-[36px] px-2.5 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#8f2a21] shadow-xs cursor-pointer hover:bg-[#fef2f2] focus:outline-none"
                >
                  {ports.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                {activePorts.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Удалить порт ${port}`}
                    onClick={() => {
                      const next = activePorts.filter((_, i) => i !== idx)
                      onChange({ stopAll: false, motors: next, motor: next[0] || "A", motor2: next[1] })
                    }}
                    className="w-[24px] h-[24px] rounded-full bg-white/20 hover:bg-white/35 text-white text-sm leading-none font-bold grid place-items-center shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            <div ref={menuRef} data-module-picker="true" className="relative shrink-0">
              <button
                type="button"
                aria-label="Добавить порт для остановки"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((prev) => !prev)}
                className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-full border border-white/55 bg-white/15 hover:bg-white/30 text-white text-lg leading-none font-black grid place-items-center"
              >
                +
              </button>
              {menuOpen && (
                <div className="absolute top-[calc(100%+6px)] right-0 z-50 w-[160px] p-1.5 rounded-[12px] border border-[#dce8ec] bg-white text-[#18313b] shadow-xl flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onChange({ stopAll: true, motors: undefined, motor2: undefined })
                    }}
                    className="min-h-[36px] text-left px-3 py-1.5 rounded-lg bg-[#fef2f2] hover:bg-[#fee2e2] text-xs font-extrabold text-[#991b1b]"
                  >
                    Все моторы
                  </button>
                  {unusedPorts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        const next = [...activePorts, p]
                        onChange({ stopAll: false, motors: next, motor: next[0], motor2: next[1] })
                      }}
                      className="min-h-[36px] text-left px-3 py-1.5 rounded-lg bg-[#f4f8fa] hover:bg-[#e5f2f7] text-xs font-extrabold text-[#18313b]"
                    >
                      + Порт {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <BlockErrorBar errorMessage={errorMessage} />
    </div>
  )
}

const CHASSIS_DIR_OPTIONS: readonly { value: ChassisDirection; icon: string; label: string }[] = [
  { value: "forward", icon: "↑", label: "Вперёд" },
  { value: "backward", icon: "↓", label: "Назад" },
  { value: "left", icon: "↶", label: "Налево" },
  { value: "right", icon: "↷", label: "Направо" },
]

export function ChassisBlock({
  block,
  chassisConfigured,
  errorMessage,
  onChange,
  onOpenChassis,
}: {
  block: WorkspaceBlock
  chassisConfigured: boolean
  errorMessage?: string
  onChange: (changes: Partial<WorkspaceBlock>) => void
  onOpenChassis: () => void
}) {
  const dir: ChassisDirection = block.chassisDirection || "forward"
  const hasSpeed = (block.modules || []).includes("speed")

  return (
    <div className="flex flex-col">
      <div className="flex flex-nowrap items-center min-h-[64px] px-3.5 gap-2 text-white">
        <button
          type="button"
          onClick={onOpenChassis}
          aria-label={chassisConfigured ? "Настроить шасси" : "Шасси не настроено: открыть настройки"}
          title={chassisConfigured ? "Настройки шасси" : "Настройте шасси"}
          className={`relative shrink-0 min-h-[36px] min-w-[36px] h-[36px] px-2 rounded-[9px] flex items-center justify-center gap-1 font-black text-xs transition-colors ${
            chassisConfigured
              ? "bg-white/20 hover:bg-white/30 text-white border border-white/35"
              : "bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] border-2 border-[#f59e0b]"
          }`}
        >
          <Settings2 size={16} aria-hidden="true" />
          {!chassisConfigured && <span aria-hidden="true">⚠</span>}
        </button>

        <div className="flex flex-nowrap items-center gap-1 shrink-0" role="group" aria-label="Направление шасси">
          {CHASSIS_DIR_OPTIONS.map((opt) => {
            const active = dir === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                aria-label={opt.label}
                aria-pressed={active}
                title={opt.label}
                onClick={() => onChange({ chassisDirection: opt.value })}
                className={`min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[9px] font-black text-base grid place-items-center transition-colors ${
                  active
                    ? "bg-white text-[#0d3b4c] shadow-sm"
                    : "bg-white/15 hover:bg-white/30 text-white"
                }`}
              >
                {opt.icon}
              </button>
            )
          })}
        </div>

        {hasSpeed ? (
          <div className="flex flex-nowrap items-center gap-1.5 pl-2 border-l border-white/30 shrink-0">
            <input
              type="number"
              min="1"
              max="1000"
              aria-label="Скорость шасси, градусов в секунду"
              value={block.speed ?? 360}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (!Number.isFinite(val)) return
                onChange({ speed: val })
              }}
              className="w-[72px] min-h-[36px] h-[36px] rounded-full px-2.5 text-center bg-white text-[#0d3b4c] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap">°/с</span>
            <button
              type="button"
              aria-label="Удалить скорость"
              onClick={() => onChange({ modules: [] })}
              className="w-[22px] h-[22px] rounded-full bg-white/20 hover:bg-white/35 text-white text-sm leading-none grid place-items-center"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Задать скорость для этого блока"
            title="Скорость"
            onClick={() => onChange({ modules: ["speed"] })}
            className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] shrink-0 rounded-full border border-white/55 bg-white/15 hover:bg-white/30 text-white text-lg leading-none font-black grid place-items-center"
          >
            +
          </button>
        )}
      </div>

      <BlockErrorBar errorMessage={errorMessage} />
    </div>
  )
}
