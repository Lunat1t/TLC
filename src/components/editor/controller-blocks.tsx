import React from "react"
import { Settings2, AlertTriangle, Waves, Lightbulb, Palette, CircleDot, Compass, RotateCcw } from "lucide-react"
import type { WorkspaceBlock, ControllerButton, ControllerEvent, ChassisDirection, ImuAxis, MotorModule, SensorColor, SensorModule, SensorOp, SensorType, TravelUnit } from "@/lib/workspace"
import { CONTROLLER_BUTTONS, BUTTON_LABELS } from "@/lib/controller-program"
import {
  DEFAULT_SENSOR_ANGLE,
  DEFAULT_SENSOR_AXIS,
  DEFAULT_SENSOR_COLOR,
  DEFAULT_SENSOR_DISTANCE,
  DEFAULT_SENSOR_FORCE,
  DEFAULT_SENSOR_LIGHT,
  DEFAULT_SENSOR_MODULE,
  DEFAULT_SENSOR_REFLECTION,
  DEFAULT_SENSOR_TILT,
  INPUT_ICONS,
  SENSOR_COLORS,
  SENSOR_MODULES_BY_TYPE,
  SENSOR_PORTS,
  formatControlOptionLabel,
  getStopPorts,
} from "@/lib/block-registry"
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

function usePopoverDismiss(open: boolean, ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const [alignLeft, setAlignLeft] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (ref.current && typeof window !== "undefined") {
      const rect = ref.current.getBoundingClientRect()
      setAlignLeft(rect.left < 190 && rect.left + 196 <= window.innerWidth)
    }
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [open, ref, onClose])

  return alignLeft
}

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
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const closeMenu = React.useCallback(() => setMenuOpen(false), [])
  const alignLeft = usePopoverDismiss(menuOpen, menuRef, closeMenu)

  const dir: ChassisDirection = block.chassisDirection || "forward"
  const modules: MotorModule[] = Array.isArray(block.modules) ? block.modules : []
  const hasSpeed = modules.includes("speed")
  const hasTravel = modules.includes("travel")
  const unit: TravelUnit = block.unit || "rotations"
  const availableAddons = (["speed", "travel"] as const).filter((m) => !modules.includes(m))

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

        {hasSpeed && (
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
              className="w-[70px] min-h-[36px] h-[36px] rounded-full px-2 text-center bg-white text-[#0d3b4c] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap">°/с</span>
            <button
              type="button"
              aria-label="Удалить скорость"
              onClick={() => onChange({ modules: modules.filter((m) => m !== "speed") })}
              className="min-w-[36px] min-h-[36px] w-[36px] h-[36px] rounded-full bg-white/20 hover:bg-white/35 text-white text-base leading-none grid place-items-center"
            >
              ×
            </button>
          </div>
        )}

        {hasTravel && (
          <div className="flex flex-nowrap items-center gap-1.5 pl-2 border-l border-white/30 shrink-0">
            <input
              type="number"
              min="0.01"
              max="10000"
              step="any"
              aria-label="Величина движения шасси"
              value={block.value ?? 1}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (!Number.isFinite(val) || val < 0.01 || val > 10000) return
                onChange({ value: val })
              }}
              className="w-[68px] min-h-[36px] h-[36px] rounded-full px-2 text-center bg-white text-[#0d3b4c] font-extrabold text-sm shadow-xs"
            />
            <select
              aria-label="Единица измерения шасси"
              value={unit}
              onChange={(e) => onChange({ unit: e.target.value as TravelUnit })}
              className="min-h-[36px] h-[36px] px-2.5 rounded-full bg-white text-[#0d3b4c] font-extrabold text-sm shadow-xs cursor-pointer"
            >
              <option value="rotations">об</option>
              <option value="degrees">°</option>
              <option value="seconds">с</option>
            </select>
            <button
              type="button"
              aria-label="Удалить величину движения"
              onClick={() => onChange({ modules: modules.filter((m) => m !== "travel") })}
              className="min-w-[36px] min-h-[36px] w-[36px] h-[36px] rounded-full bg-white/20 hover:bg-white/35 text-white text-base leading-none grid place-items-center"
            >
              ×
            </button>
          </div>
        )}

        {availableAddons.length > 0 && (
          <div ref={menuRef} data-module-picker="true" className="relative shrink-0">
            <button
              type="button"
              aria-label="Добавить модуль шасси"
              aria-expanded={menuOpen}
              title="Добавить модуль"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-full border border-white/55 bg-white/15 hover:bg-white/30 text-white text-lg leading-none font-black grid place-items-center"
            >
              +
            </button>
            {menuOpen && (
              <div className={`absolute top-[calc(100%+6px)] ${alignLeft ? "left-0" : "right-0"} z-50 w-[184px] max-w-[calc(100vw-16px)] p-1.5 rounded-[12px] border border-[#dce8ec] bg-white text-[#18313b] shadow-xl flex flex-col gap-1`}>
                {availableAddons.includes("speed") && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onChange({ modules: [...modules, "speed"] })
                    }}
                    className="min-h-[36px] text-left px-3 py-1.5 rounded-lg bg-[#eff8fb] hover:bg-[#dff2f8] text-xs font-extrabold text-[#0d3b4c]"
                  >
                    + Скорость (°/с)
                  </button>
                )}
                {availableAddons.includes("travel") && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onChange({ modules: [...modules, "travel"] })
                    }}
                    className="min-h-[36px] text-left px-3 py-1.5 rounded-lg bg-[#eff8fb] hover:bg-[#dff2f8] text-xs font-extrabold text-[#0d3b4c]"
                  >
                    + Величина (°, об, с)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <BlockErrorBar errorMessage={errorMessage} />
    </div>
  )
}

const SENSOR_TYPE_OPTIONS: readonly {
  value: SensorType
  label: string
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>
}[] = [
  { value: "ultrasonic", label: "Ультразвук", Icon: Waves },
  { value: "color", label: "Цвет", Icon: Palette },
  { value: "force", label: "Сила / нажатие", Icon: CircleDot },
  { value: "imu", label: "Гироскоп (IMU)", Icon: Compass },
]

const COLOR_SWATCH_STYLES: Record<SensorColor, { hex: string; label: string }> = {
  red: { hex: "#ef4444", label: "Красный" },
  yellow: { hex: "#facc15", label: "Жёлтый" },
  green: { hex: "#22c55e", label: "Зелёный" },
  blue: { hex: "#3b82f6", label: "Синий" },
  white: { hex: "#f8fafc", label: "Белый" },
  black: { hex: "#0f172a", label: "Чёрный" },
  none: { hex: "transparent", label: "Нет цвета" },
}

const SENSOR_MODULE_MENU_LABELS: Record<SensorModule, string> = {
  threshold: "+ Порог (< / > см)",
  lights: "+ 💡 Подсветка",
  color: "+ Цвет",
  reflection: "+ Отражение (< / > %)",
  pressed: "+ Нажат / отпущен",
  force: "+ Сила (< / > Н)",
  heading: "+ Курс (< / > °)",
  tilt: "+ Наклон (↕/↔ °)",
  reset: "+ ↺ Сброс 0°",
}

export function SensorBlock({
  block,
  slotted = false,
  errorMessage,
  onChange,
  onStartDrag,
}: {
  block: WorkspaceBlock
  slotted?: boolean
  errorMessage?: string
  onChange: (changes: Partial<WorkspaceBlock>) => void
  onStartDrag?: (e: React.PointerEvent<HTMLDivElement>) => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [colorOpen, setColorOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const colorRef = React.useRef<HTMLDivElement>(null)

  const closeMenu = React.useCallback(() => setMenuOpen(false), [])
  const closeColor = React.useCallback(() => setColorOpen(false), [])
  const menuAlignLeft = usePopoverDismiss(menuOpen, menuRef, closeMenu)
  const colorAlignLeft = usePopoverDismiss(colorOpen, colorRef, closeColor)

  const sensorType: SensorType = block.sensorType || "ultrasonic"
  const isImu = sensorType === "imu"
  const port = block.sensorPort || "C"
  const op: SensorOp = block.sensorOp === "gt" ? "gt" : "lt"
  const distance = block.sensorDistance ?? DEFAULT_SENSOR_DISTANCE
  const light = block.sensorLight ?? DEFAULT_SENSOR_LIGHT
  const color: SensorColor = block.sensorColor || DEFAULT_SENSOR_COLOR
  const reflection = block.sensorReflection ?? DEFAULT_SENSOR_REFLECTION
  const pressed = block.sensorPressed !== false
  const force = block.sensorForce ?? DEFAULT_SENSOR_FORCE
  const angle = block.sensorAngle ?? DEFAULT_SENSOR_ANGLE
  const tiltAxis: ImuAxis = block.sensorAxis === "roll" ? "roll" : DEFAULT_SENSOR_AXIS
  const tiltOp: SensorOp = (block.sensorTiltOp ?? block.sensorOp) === "gt" ? "gt" : "lt"
  const tiltAngle = block.sensorTilt ?? DEFAULT_SENSOR_TILT

  const allowedForType = SENSOR_MODULES_BY_TYPE[sensorType]
  const rawModules: SensorModule[] = Array.isArray(block.sensorModules)
    ? block.sensorModules.filter((m) => allowedForType.includes(m))
    : [DEFAULT_SENSOR_MODULE[sensorType]]
  const modules: SensorModule[] = (slotted && isImu ? rawModules.filter((m) => m !== "reset") : rawModules)
  const effectiveModules: SensorModule[] = modules.length > 0 ? modules : [DEFAULT_SENSOR_MODULE[sensorType]]

  const availableAddons = allowedForType.filter(
    (m) => !effectiveModules.includes(m) && !(slotted && m === "reset")
  )
  const canRemove = effectiveModules.length > 1
  const setModules = (next: SensorModule[]) => onChange({ sensorModules: next })

  const removeButton = (mod: SensorModule, label: string) =>
    canRemove ? (
      <button
        type="button"
        aria-label={label}
        onClick={() => setModules(effectiveModules.filter((m) => m !== mod))}
        className="min-w-[36px] min-h-[36px] w-[36px] h-[36px] rounded-full bg-white/20 hover:bg-white/35 text-white text-base leading-none grid place-items-center shrink-0"
      >
        ×
      </button>
    ) : null

  return (
    <div className="flex flex-col">
      <div
        onPointerDown={(e) => {
          if (!onStartDrag) return
          if ((e.target as HTMLElement).closest("button, select, input")) return
          onStartDrag(e)
        }}
        className={`flex flex-nowrap items-center text-white ${
          slotted
            ? "min-h-[42px] h-[42px] px-2 gap-1.5 rounded-full bg-[#4f46e5] border border-white/35 shadow-[inset_0_-2px_#3730a3] cursor-grab active:cursor-grabbing pointer-events-auto"
            : "min-h-[64px] px-3.5 gap-2"
        }`}
      >
        {/* 4-sensor visual type switcher */}
        <div
          role="group"
          aria-label="Тип датчика"
          className="flex flex-nowrap items-center gap-0.5 rounded-[10px] bg-[#3730a3]/85 p-0.5 shrink-0"
        >
          {SENSOR_TYPE_OPTIONS.map(({ value, label, Icon }) => {
            const active = sensorType === value
            return (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={active}
                title={label}
                onClick={() => {
                  setMenuOpen(false)
                  setColorOpen(false)
                  if (value !== sensorType) {
                    onChange({ sensorType: value })
                  }
                }}
                className={`min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[8px] grid place-items-center transition-colors ${
                  active
                    ? "bg-white text-[#312e81] shadow-xs"
                    : "text-white/80 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Icon size={slotted ? 15 : 16} aria-hidden={true} />
              </button>
            )
          })}
        </div>

        {/* Port selector (hidden for built-in IMU) */}
        {!isImu && (
          <select
            value={port}
            aria-label="Порт датчика"
            title="Порт датчика (C–F)"
            onChange={(e) => onChange({ sensorPort: e.target.value })}
            className="min-h-[36px] h-[36px] shrink-0 px-2 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#3730a3] cursor-pointer"
          >
            {SENSOR_PORTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        {/* Ultrasonic: threshold */}
        {sensorType === "ultrasonic" && effectiveModules.includes("threshold") && (
          <div className="flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <button
              type="button"
              aria-label="Условие сравнения расстояния"
              title={op === "lt" ? "Ближе (<)" : "Дальше (>)"}
              onClick={() => onChange({ sensorOp: op === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[9px] bg-white text-[#312e81] font-black text-base grid place-items-center border-2 border-[#3730a3] hover:bg-[#eef2ff]"
            >
              {op === "lt" ? "<" : ">"}
            </button>
            <input
              type="number"
              min="1"
              max="200"
              aria-label="Расстояние в сантиметрах"
              value={distance}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (!Number.isFinite(val)) return
                onChange({ sensorDistance: val })
              }}
              className="w-[54px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#18313b] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap">см</span>
            {removeButton("threshold", "Удалить порог расстояния")}
          </div>
        )}

        {/* Color: color swatch picker */}
        {sensorType === "color" && effectiveModules.includes("color") && (
          <div ref={colorRef} data-module-picker="true" className="relative flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <button
              type="button"
              aria-label={`Цвет: ${COLOR_SWATCH_STYLES[color].label}`}
              aria-expanded={colorOpen}
              title={COLOR_SWATCH_STYLES[color].label}
              onClick={() => setColorOpen((prev) => !prev)}
              className="min-h-[36px] min-w-[36px] h-[36px] px-2 rounded-[9px] bg-white text-[#18313b] border-2 border-[#3730a3] flex items-center justify-center gap-1 cursor-pointer"
            >
              {color === "none" ? (
                <span className="text-sm font-black text-[#475569]">⊘</span>
              ) : (
                <span
                  aria-hidden="true"
                  className="w-4 h-4 rounded-full border border-[#cbd5e1]"
                  style={{ backgroundColor: COLOR_SWATCH_STYLES[color].hex }}
                />
              )}
            </button>
            {colorOpen && (
              <div className={`absolute top-[calc(100%+6px)] ${colorAlignLeft ? "left-0" : "right-0"} z-50 p-1.5 rounded-[12px] border border-[#dce8ec] bg-white shadow-xl grid grid-cols-4 gap-1 w-[164px]`}>
                {SENSOR_COLORS.map((c) => {
                  const sw = COLOR_SWATCH_STYLES[c]
                  const selected = c === color
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={sw.label}
                      aria-pressed={selected}
                      title={sw.label}
                      onClick={() => {
                        setColorOpen(false)
                        onChange({ sensorColor: c })
                      }}
                      className={`min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-lg grid place-items-center border ${
                        selected ? "border-[#4f46e5] ring-2 ring-[#818cf8]" : "border-[#e2e8f0] hover:bg-[#f1f5f9]"
                      }`}
                    >
                      {c === "none" ? (
                        <span className="text-sm font-black text-[#475569]">⊘</span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="w-5 h-5 rounded-full border border-[#cbd5e1]"
                          style={{ backgroundColor: sw.hex }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {removeButton("color", "Удалить модуль цвета")}
          </div>
        )}

        {/* Color: reflection */}
        {sensorType === "color" && effectiveModules.includes("reflection") && (
          <div className="flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <button
              type="button"
              aria-label="Условие сравнения отражения"
              title={op === "lt" ? "Темнее (<)" : "Светлее (>)"}
              onClick={() => onChange({ sensorOp: op === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[9px] bg-white text-[#312e81] font-black text-base grid place-items-center border-2 border-[#3730a3] hover:bg-[#eef2ff]"
            >
              {op === "lt" ? "<" : ">"}
            </button>
            <input
              type="number"
              min="0"
              max="100"
              aria-label="Отражение в процентах"
              value={reflection}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (!Number.isFinite(val)) return
                onChange({ sensorReflection: val })
              }}
              className="w-[52px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#18313b] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap">%</span>
            {removeButton("reflection", "Удалить отражение")}
          </div>
        )}

        {/* Force: pressed */}
        {sensorType === "force" && effectiveModules.includes("pressed") && (
          <div className="flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <button
              type="button"
              aria-label={pressed ? "Состояние: нажата" : "Состояние: отпущена"}
              aria-pressed={pressed}
              title={pressed ? "Нажат" : "Отпущен"}
              onClick={() => onChange({ sensorPressed: !pressed })}
              className="min-h-[36px] min-w-[36px] h-[36px] px-2.5 rounded-[9px] bg-white text-[#312e81] font-black text-xs flex items-center gap-1 border-2 border-[#3730a3] hover:bg-[#eef2ff]"
            >
              <span aria-hidden="true">{pressed ? "●" : "○"}</span>
              <span>{pressed ? "Нажат" : "Отпущен"}</span>
            </button>
            {removeButton("pressed", "Удалить проверку нажатия")}
          </div>
        )}

        {/* Force: force (N) */}
        {sensorType === "force" && effectiveModules.includes("force") && (
          <div className="flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <button
              type="button"
              aria-label="Условие сравнения силы"
              title={op === "lt" ? "Меньше (<)" : "Больше (>)"}
              onClick={() => onChange({ sensorOp: op === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[9px] bg-white text-[#312e81] font-black text-base grid place-items-center border-2 border-[#3730a3] hover:bg-[#eef2ff]"
            >
              {op === "lt" ? "<" : ">"}
            </button>
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              aria-label="Сила в ньютонах"
              value={force}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (!Number.isFinite(val)) return
                onChange({ sensorForce: val })
              }}
              className="w-[52px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#18313b] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap">Н</span>
            {removeButton("force", "Удалить порог силы")}
          </div>
        )}

        {/* IMU: heading */}
        {sensorType === "imu" && effectiveModules.includes("heading") && (
          <div className="flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <button
              type="button"
              aria-label="Условие сравнения курса"
              title={op === "lt" ? "Меньше (<)" : "Больше (>)"}
              onClick={() => onChange({ sensorOp: op === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[9px] bg-white text-[#312e81] font-black text-base grid place-items-center border-2 border-[#3730a3] hover:bg-[#eef2ff]"
            >
              {op === "lt" ? "<" : ">"}
            </button>
            <input
              type="number"
              min="-360"
              max="360"
              aria-label="Угол курса в градусах"
              value={angle}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (!Number.isFinite(val)) return
                onChange({ sensorAngle: val })
              }}
              className="w-[56px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#18313b] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap">°</span>
            {removeButton("heading", "Удалить курс")}
          </div>
        )}

        {/* IMU: tilt */}
        {sensorType === "imu" && effectiveModules.includes("tilt") && (
          <div className="flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <button
              type="button"
              aria-label={tiltAxis === "pitch" ? "Ось наклона: тангаж" : "Ось наклона: крен"}
              title={tiltAxis === "pitch" ? "Тангаж (↕)" : "Крен (↔)"}
              onClick={() => onChange({ sensorAxis: tiltAxis === "pitch" ? "roll" : "pitch" })}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[9px] bg-white text-[#312e81] font-black text-sm grid place-items-center border-2 border-[#3730a3] hover:bg-[#eef2ff]"
            >
              {tiltAxis === "pitch" ? "↕" : "↔"}
            </button>
            <button
              type="button"
              aria-label="Условие сравнения наклона"
              title={tiltOp === "lt" ? "Меньше (<)" : "Больше (>)"}
              onClick={() => onChange({ sensorTiltOp: tiltOp === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[9px] bg-white text-[#312e81] font-black text-base grid place-items-center border-2 border-[#3730a3] hover:bg-[#eef2ff]"
            >
              {tiltOp === "lt" ? "<" : ">"}
            </button>
            <input
              type="number"
              min="-90"
              max="90"
              aria-label="Угол наклона в градусах"
              value={tiltAngle}
              onChange={(e) => {
                const val = Number(e.target.value)
                if (!Number.isFinite(val)) return
                onChange({ sensorTilt: val })
              }}
              className="w-[54px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#18313b] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap">°</span>
            {removeButton("tilt", "Удалить наклон")}
          </div>
        )}

        {/* IMU: reset (chain only) */}
        {sensorType === "imu" && !slotted && effectiveModules.includes("reset") && (
          <div className="flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <span className="min-h-[36px] h-[36px] px-2 rounded-[9px] bg-white/15 border border-white/30 text-xs font-extrabold flex items-center gap-1 whitespace-nowrap">
              <RotateCcw size={13} aria-hidden="true" />
              0°
            </span>
            {removeButton("reset", "Удалить сброс 0°")}
          </div>
        )}

        {/* Lights (ultrasonic & color) */}
        {(sensorType === "ultrasonic" || sensorType === "color") && effectiveModules.includes("lights") && (
          <div className="flex flex-nowrap items-center gap-1 pl-1.5 border-l border-white/30 shrink-0">
            <Lightbulb size={15} aria-hidden="true" className="shrink-0 text-amber-200" />
            <select
              value={String(light)}
              aria-label="Подсветка датчика"
              title="Подсветка датчика"
              onChange={(e) => onChange({ sensorLight: Number(e.target.value) })}
              className="min-h-[36px] h-[36px] px-2 rounded-[9px] bg-white text-[#18313b] font-black text-xs border-2 border-[#3730a3] cursor-pointer"
            >
              <option value="100">100%</option>
              <option value="50">50%</option>
              <option value="25">25%</option>
              <option value="-1">Выкл</option>
            </select>
            {removeButton("lights", "Удалить подсветку датчика")}
          </div>
        )}

        {availableAddons.length > 0 && (
          <div ref={menuRef} data-module-picker="true" className="relative shrink-0">
            <button
              type="button"
              aria-label="Добавить модуль датчика"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-full border border-white/55 bg-white/15 hover:bg-white/30 text-white text-lg leading-none font-black grid place-items-center"
            >
              +
            </button>
            {menuOpen && (
              <div className={`absolute top-[calc(100%+6px)] ${menuAlignLeft ? "left-0" : "right-0"} z-50 w-[184px] max-w-[calc(100vw-16px)] p-1.5 rounded-[12px] border border-[#dce8ec] bg-white text-[#18313b] shadow-xl flex flex-col gap-1`}>
                {availableAddons.map((mod) => (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setModules([...effectiveModules, mod])
                    }}
                    className={`min-h-[36px] text-left px-3 py-1.5 rounded-lg text-xs font-extrabold ${
                      mod === "lights"
                        ? "bg-[#fefce8] hover:bg-[#fef08a] text-[#854d0e]"
                        : "bg-[#eef2ff] hover:bg-[#e0e7ff] text-[#312e81]"
                    }`}
                  >
                    {SENSOR_MODULE_MENU_LABELS[mod]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!slotted && <BlockErrorBar errorMessage={errorMessage} />}
    </div>
  )
}
