import React from "react"
import { Activity, AlertTriangle, Check, ChevronDown, Compass, Gamepad2, Hourglass, Lightbulb, RotateCcw, Settings2, Trash2 } from "lucide-react"
import type { WorkspaceBlock, ControllerButton, ControllerEvent, ChassisDirection, ImuAxis, SensorColor, SensorModule, SensorOp, SensorType } from "@/lib/workspace"
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
import { ModuleBar, ModuleCapsuleIconPopover, usePopoverDismiss } from "@/components/editor/module-bar"
import { CONTROL_INPUTS, type ControlInstance } from "@/lib/control-workspace"
import type { SensorTelemetry } from "@/lib/controller-runtime"
import {
  COLOR_SWATCH_STYLES,
  CONTROLLER_EVENT_LABELS,
  SENSOR_MODULE_INFO,
  formatSensorLightLabel,
  formatSensorLiveBadge,
  getSensorComparisonWord,
  nextControllerEvent,
  nextSensorLight,
} from "@/lib/controller-block-ui"
import {
  ColorBeamScene,
  ForceButtonScene,
  ImuTiltScene,
  LightsGlowScene,
  ReflectionScene,
  UltrasonicEyesScene,
} from "@/components/editor/block-scenes"

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
      <div className="flex flex-nowrap items-center min-h-[58px] px-3 gap-3 text-[#1d1b1a]">
        <span className="inline-flex items-center gap-1.5 text-[15px] font-extrabold whitespace-nowrap tracking-tight shrink-0">
          <Gamepad2 size={16} aria-hidden="true" className="shrink-0 opacity-95" />
          <span>Кнопка</span>
        </span>
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
                className="min-h-[36px] h-[36px] max-w-[96px] shrink-0 px-2 rounded-[9px] bg-white text-[#1d1b1a] font-black text-xs shadow-xs cursor-pointer"
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
              className="min-h-[36px] h-[36px] min-w-[52px] shrink-0 px-2 rounded-[9px] bg-white text-[#1d1b1a] font-black text-sm shadow-xs cursor-pointer"
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
            className="min-h-[36px] h-[36px] shrink-0 px-2 rounded-[9px] bg-white text-[#1d1b1a] font-black text-sm shadow-xs cursor-pointer"
          >
            {CONTROLLER_BUTTONS.map((btn) => (
              <option key={btn} value={btn} aria-label={BUTTON_ARIA_LABELS[btn]}>
                {COMPACT_BUTTON_LABELS[btn] || BUTTON_LABELS[btn]}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          aria-label={`Режим срабатывания кнопки: ${CONTROLLER_EVENT_LABELS[currentEvent]}`}
          title={`Режим кнопки: ${CONTROLLER_EVENT_LABELS[currentEvent]}`}
          onClick={() => onChange({ event: nextControllerEvent(currentEvent) })}
          className="min-h-[36px] min-w-[36px] h-[36px] shrink-0 px-2.5 rounded-[9px] bg-white text-[#1d1b1a] font-black text-xs shadow-xs cursor-pointer hover:bg-[#fff7ed] transition-colors flex items-center justify-center whitespace-nowrap"
        >
          {CONTROLLER_EVENT_LABELS[currentEvent]}
        </button>
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
  const closeMenu = React.useCallback(() => setMenuOpen(false), [])
  const { alignLeft, openUp } = usePopoverDismiss(menuOpen, menuRef, closeMenu)
  const stopInfo = getStopPorts(block)
  const isStopAll = stopInfo.stopAll
  const activePorts = isStopAll ? [] : stopInfo.ports

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center max-w-[var(--row-width)] min-h-[64px] px-3 py-2 gap-3 text-[#1d1b1a]">
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
          <div className="flex flex-nowrap items-center min-h-[36px] h-[36px] px-2.5 rounded-[9px] bg-white text-[#1d1b1a] font-black text-xs shadow-xs shrink-0">
            <span className="whitespace-nowrap">Все моторы</span>
          </div>
        ) : activePorts.length > 2 ? null : (
          <div className="flex flex-nowrap items-center gap-1.5 shrink-0">
            {activePorts.map((port, idx) => (
              <select
                key={`${idx}:${port}`}
                value={port}
                aria-label={`Порт мотора ${idx + 1} для остановки`}
                onChange={(e) => {
                  const next = [...activePorts]
                  next[idx] = e.target.value
                  onChange({ stopAll: false, motors: next, motor: next[0], motor2: next[1] })
                }}
                className="min-h-[36px] h-[36px] px-2.5 rounded-[9px] bg-white text-[#1d1b1a] font-black text-sm shadow-xs cursor-pointer hover:bg-[#fef2f2] focus:outline-none"
              >
                {ports.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ))}
          </div>
        )}

        <div ref={menuRef} data-module-picker="true" className="relative shrink-0">
          <button
            type="button"
            aria-label={activePorts.length > 2 ? `Изменить порты: ${activePorts.join(", ")}` : "Добавить порт для остановки"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-full border border-white/55 bg-white/15 hover:bg-white/30 text-[#1d1b1a] text-lg leading-none font-black grid place-items-center"
          >
            +
          </button>
          {menuOpen && (
            <div className={`absolute ${openUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"} ${alignLeft ? "left-0" : "right-0"} z-50 w-[168px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-24px)] overflow-y-auto p-1.5 rounded-[12px] border border-[#f3e8d5] bg-white text-[#1d1b1a] shadow-xl flex flex-col gap-1`}>
              <button
                type="button"
                aria-pressed={isStopAll}
                onClick={() => {
                  setMenuOpen(false)
                  if (isStopAll) {
                    onChange({ stopAll: false, motors: [ports[0] || "A"], motor: ports[0] || "A" })
                  } else {
                    onChange({ stopAll: true, motors: undefined, motor2: undefined })
                  }
                }}
                className={`min-h-[36px] flex items-center gap-2 text-left px-3 py-1.5 rounded-lg text-xs font-extrabold ${
                  isStopAll
                    ? "bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b]"
                    : "bg-[#fef2f2] hover:bg-[#fee2e2] text-[#991b1b]"
                }`}
              >
                <Check size={14} aria-hidden="true" className={isStopAll ? "opacity-100 shrink-0" : "opacity-0 shrink-0"} />
                <span>Все моторы</span>
              </button>
              {ports.map((p) => {
                const isPortActive = !isStopAll && activePorts.includes(p)
                const isLastPort = isPortActive && activePorts.length === 1
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={isPortActive}
                    disabled={isLastPort}
                    onClick={() => {
                      if (isLastPort) return
                      setMenuOpen(false)
                      if (isStopAll) {
                        onChange({ stopAll: false, motors: [p], motor: p, motor2: undefined })
                      } else if (isPortActive) {
                        const next = activePorts.filter((item) => item !== p)
                        onChange({ stopAll: false, motors: next, motor: next[0] || "A", motor2: next[1] })
                      } else {
                        const next = [...activePorts, p]
                        onChange({ stopAll: false, motors: next, motor: next[0], motor2: next[1] })
                      }
                    }}
                    className={`min-h-[36px] flex items-center gap-2 text-left px-3 py-1.5 rounded-lg text-xs font-extrabold disabled:opacity-60 ${
                      isPortActive
                        ? "bg-[#f7f0e5] hover:bg-[#f3e9d7] text-[#a8211a]"
                        : "bg-[#fbf8f3] hover:bg-[#f7f0e5] text-[#1d1b1a]"
                    }`}
                  >
                    <Check size={14} aria-hidden="true" className={isPortActive ? "opacity-100 shrink-0" : "opacity-0 shrink-0"} />
                    <span>Порт {p}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
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

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center max-w-[var(--row-width)] min-h-[64px] px-3 py-2 gap-3 text-[#1d1b1a]">
        <button
          type="button"
          onClick={onOpenChassis}
          aria-label={chassisConfigured ? "Настроить шасси" : "Шасси не настроено: открыть настройки"}
          title={chassisConfigured ? "Настройки шасси" : "Настройте шасси"}
          className={`relative shrink-0 min-h-[36px] h-[36px] px-2.5 rounded-[9px] flex items-center justify-center gap-1.5 font-black text-xs whitespace-nowrap transition-colors ${
            chassisConfigured
              ? "bg-white/20 hover:bg-white/30 text-[#1d1b1a] border border-white/35"
              : "bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] border-2 border-[#f59e0b]"
          }`}
        >
          <Settings2 size={15} aria-hidden="true" className="shrink-0" />
          <span className="whitespace-nowrap">Шасси</span>
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
                    ? "bg-white text-[#1d1b1a] shadow-sm"
                    : "bg-white/15 hover:bg-white/30 text-[#1d1b1a]"
                }`}
              >
                {opt.icon}
              </button>
            )
          })}
        </div>

        <ModuleBar blockType="chassis" block={block} subject="шасси" onChange={onChange} />
      </div>

      <BlockErrorBar errorMessage={errorMessage} />
    </div>
  )
}

const SENSOR_TYPE_OPTIONS: readonly {
  value: SensorType
  label: string
  renderIcon: (size?: number) => React.ReactNode
}[] = [
  { value: "ultrasonic", label: "Расстояние", renderIcon: (size = 17) => <UltrasonicEyesScene size={size} /> },
  { value: "color", label: "Цвет", renderIcon: (size = 17) => <ColorBeamScene size={size} /> },
  { value: "force", label: "Нажатие", renderIcon: (size = 17) => <ForceButtonScene size={size} /> },
  { value: "imu", label: "Наклон", renderIcon: (size = 17) => <ImuTiltScene size={size} /> },
]

const SENSOR_MODULE_MENU_ITEMS: Record<
  SensorModule,
  { label: string; renderIcon: (size?: number) => React.ReactNode }
> = {
  threshold: { label: "Порог см", renderIcon: (size = 16) => <UltrasonicEyesScene size={size} /> },
  lights: { label: "Подсветка", renderIcon: (size = 16) => <LightsGlowScene size={size} /> },
  color: { label: "Цвет", renderIcon: (size = 16) => <ColorBeamScene size={size} /> },
  reflection: { label: "Свет %", renderIcon: (size = 16) => <ReflectionScene size={size} /> },
  pressed: { label: "Нажат", renderIcon: (size = 16) => <ForceButtonScene size={size} /> },
  force: { label: "Сила Н", renderIcon: (size = 16) => <Activity size={size} aria-hidden="true" /> },
  heading: { label: "Курс °", renderIcon: (size = 16) => <Compass size={size} aria-hidden="true" /> },
  tilt: { label: "Наклон °", renderIcon: (size = 16) => <ImuTiltScene size={size} /> },
  reset: { label: "Сброс 0°", renderIcon: (size = 16) => <RotateCcw size={size} aria-hidden="true" /> },
}

export function SensorBlock({
  block,
  slotted = false,
  liveReady = false,
  sensorDistances,
  sensorTelemetry,
  errorMessage,
  onChange,
  onStartDrag,
  onRemoveFromCondition,
}: {
  block: WorkspaceBlock
  slotted?: boolean
  liveReady?: boolean
  sensorDistances?: Record<string, number | null>
  sensorTelemetry?: Record<string, SensorTelemetry>
  errorMessage?: string
  onChange: (changes: Partial<WorkspaceBlock>) => void
  onStartDrag?: (e: React.PointerEvent<HTMLDivElement>) => void
  onRemoveFromCondition?: () => void
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [colorOpen, setColorOpen] = React.useState(false)
  const [typeOpen, setTypeOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const colorRef = React.useRef<HTMLDivElement>(null)
  const typeRef = React.useRef<HTMLDivElement>(null)

  const closeMenu = React.useCallback(() => setMenuOpen(false), [])
  const closeColor = React.useCallback(() => setColorOpen(false), [])
  const closeType = React.useCallback(() => setTypeOpen(false), [])
  const { alignLeft: menuAlignLeft, openUp: menuOpenUp } = usePopoverDismiss(menuOpen, menuRef, closeMenu)
  const { alignLeft: colorAlignLeft, openUp: colorOpenUp } = usePopoverDismiss(colorOpen, colorRef, closeColor)
  const { alignLeft: typeAlignLeft, openUp: typeOpenUp } = usePopoverDismiss(typeOpen, typeRef, closeType)

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

  const menuModules = allowedForType.filter((m) => !(slotted && m === "reset"))
  const setModules = (next: SensorModule[]) => onChange({ sensorModules: next })
  const activeSensorOption = SENSOR_TYPE_OPTIONS.find((opt) => opt.value === sensorType) || SENSOR_TYPE_OPTIONS[0]

  const isOnlyLights = effectiveModules.length === 1 && effectiveModules[0] === "lights"
  const isOnlyReset = effectiveModules.length === 1 && effectiveModules[0] === "reset"

  const renderModulePopoverButton = (mod: SensorModule, customIcon?: React.ReactNode, iconClassName?: string) => {
    const info = SENSOR_MODULE_INFO[mod]
    const canRemove = effectiveModules.length > 1
    return (
      <ModuleCapsuleIconPopover
        title={info.title}
        description={info.description}
        ariaLabel={`Модуль датчика: ${info.title}`}
        icon={customIcon || SENSOR_MODULE_MENU_ITEMS[mod].renderIcon(17)}
        iconClassName={iconClassName}
        canRemove={canRemove}
        mandatoryLabel="Обязательный модуль"
        onWillOpen={() => {
          setMenuOpen(false)
          setColorOpen(false)
          setTypeOpen(false)
        }}
        onRemove={() => {
          if (!canRemove) return
          setModules(effectiveModules.filter((m) => m !== mod))
        }}
      />
    )
  }

  const renderLiveBadge = (mod: SensorModule) => {
    if (!liveReady) return null
    const badge = formatSensorLiveBadge({
      module: mod,
      port,
      sensorType,
      tiltAxis,
      sensorDistances,
      sensorTelemetry,
    })
    if (!badge) return null
    return (
      <span
        data-live-badge={mod}
        aria-label={badge.label}
        title={badge.label}
        className={`${badge.minWidthClass} h-[22px] text-[11px] font-bold leading-none tabular-nums bg-white/85 px-1.5 rounded-[7px] inline-flex items-center justify-center whitespace-nowrap shrink-0 text-[#1d1b1a]`}
      >
        {badge.kind === "color" ? (
          <span
            aria-hidden="true"
            className="w-[10px] h-[10px] rounded-full border border-white/60 shrink-0"
            style={{ backgroundColor: badge.hex }}
          />
        ) : (
          badge.text
        )}
      </span>
    )
  }

  return (
    <div className="flex flex-col">
      <div
        onPointerDown={(e) => {
          if (!onStartDrag) return
          if ((e.target as HTMLElement).closest("button, select, input")) return
          onStartDrag(e)
        }}
        data-block-cat={slotted ? "sensors" : undefined}
        className={`flex flex-wrap items-center text-[#1d1b1a] ${
          slotted
            ? "min-h-[48px] max-w-[calc(var(--row-width)-100px)] px-3 gap-3 rounded-xl bg-[#f4ebda] cursor-grab active:cursor-grabbing pointer-events-auto"
            : "max-w-[var(--row-width)] min-h-[64px] px-3 py-2 gap-3"
        }`}
      >
        {/* Explicit action badge only on standalone SensorBlock (!slotted) */}
        {!slotted && (
          <span
            data-sensor-action-badge={isOnlyLights ? "lights" : isOnlyReset ? "reset" : "wait"}
            className="min-h-[36px] h-[36px] px-2.5 rounded-[9px] bg-transparent text-[#1d1b1a] font-extrabold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {isOnlyLights ? (
              <>
                <Lightbulb size={14} aria-hidden="true" className="text-amber-200 shrink-0" />
                <span>Свет</span>
              </>
            ) : isOnlyReset ? (
              <>
                <RotateCcw size={14} aria-hidden="true" className="shrink-0" />
                <span>0°</span>
              </>
            ) : (
              <>
                <Hourglass size={14} aria-hidden="true" className="shrink-0 text-indigo-700" />
                <span>Ждать</span>
              </>
            )}
          </span>
        )}

        {/* Single active sensor-type button with popover */}
        <div ref={typeRef} data-module-picker="true" className="relative shrink-0">
          <button
            type="button"
            aria-label={`Тип датчика: ${activeSensorOption.label}`}
            aria-expanded={typeOpen}
            title={`Тип датчика: ${activeSensorOption.label}`}
            onClick={() => {
              setMenuOpen(false)
              setColorOpen(false)
              setTypeOpen((prev) => !prev)
            }}
            className={`min-h-[36px] h-[36px] ${
              slotted ? "px-2 gap-1" : "px-2.5 gap-1.5"
            } rounded-[9px] bg-white text-[#a8211a] flex items-center justify-center shadow-xs hover:bg-[#fbf8f2] cursor-pointer whitespace-nowrap`}
          >
            {activeSensorOption.renderIcon(slotted ? 15 : 17)}
            <span className="text-xs font-extrabold whitespace-nowrap">
              {slotted ? activeSensorOption.label : `Датчик · ${activeSensorOption.label}`}
            </span>
            <ChevronDown size={11} aria-hidden="true" className="shrink-0 opacity-75" />
          </button>
          {typeOpen && (
            <div className={`absolute ${typeOpenUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"} ${typeAlignLeft ? "left-0" : "right-0"} z-50 w-[190px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-24px)] overflow-y-auto p-1.5 rounded-[12px] border border-[#f3e8d5] bg-white text-[#1d1b1a] shadow-xl flex flex-col gap-1`}>
              {SENSOR_TYPE_OPTIONS.map(({ value, label, renderIcon }) => {
                const active = sensorType === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setTypeOpen(false)
                      setMenuOpen(false)
                      setColorOpen(false)
                      if (value !== sensorType) {
                        onChange({ sensorType: value })
                      }
                    }}
                    className={`min-h-[36px] flex items-center gap-2 text-left px-3 py-1.5 rounded-lg text-xs font-extrabold ${
                      active
                        ? "bg-[#f8f2e7] hover:bg-[#f2e7d3] text-[#a8211a]"
                        : "bg-[#fdfbf7] hover:bg-[#fbf8f2] text-[#a8211a]"
                    }`}
                  >
                    <Check size={14} aria-hidden="true" className={active ? "opacity-100 shrink-0" : "opacity-0 shrink-0"} />
                    {renderIcon(16)}
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Port selector (hidden for built-in IMU) */}
        {!isImu && (
          <select
            value={port}
            aria-label="Порт датчика"
            title="Порт датчика (C–F)"
            onChange={(e) => onChange({ sensorPort: e.target.value })}
            className="min-h-[36px] h-[36px] shrink-0 px-2 rounded-[9px] bg-white text-[#1d1b1a] font-black text-sm shadow-xs cursor-pointer"
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
          <div className="flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton("threshold")}
            {renderLiveBadge("threshold")}
            <button
              type="button"
              aria-label="Условие сравнения расстояния"
              title={op === "lt" ? "Ближе (<)" : "Дальше (>)"}
              onClick={() => onChange({ sensorOp: op === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] h-[36px] px-2 rounded-[9px] bg-white text-[#a8211a] font-extrabold text-xs flex items-center gap-1 shadow-xs hover:bg-[#fbf8f2] whitespace-nowrap"
            >
              <span>{getSensorComparisonWord("threshold", op)}</span>
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
              className="w-[52px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#1d1b1a] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap pr-1">см</span>
          </div>
        )}

        {/* Color: color swatch picker */}
        {sensorType === "color" && effectiveModules.includes("color") && (
          <div ref={colorRef} data-module-picker="true" className="relative flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton("color")}
            {renderLiveBadge("color")}
            <button
              type="button"
              aria-label={`Цвет: ${COLOR_SWATCH_STYLES[color].label}`}
              aria-expanded={colorOpen}
              title={COLOR_SWATCH_STYLES[color].label}
              onClick={() => setColorOpen((prev) => !prev)}
              className="min-h-[36px] min-w-[36px] h-[36px] px-2 rounded-[9px] bg-white text-[#1d1b1a] shadow-xs flex items-center justify-center gap-1 cursor-pointer"
            >
              {color === "none" ? (
                <span className="text-sm font-black text-[#5f5951]">⊘</span>
              ) : (
                <span
                  aria-hidden="true"
                  className="w-4 h-4 rounded-full border border-[#eddcbf]"
                  style={{ backgroundColor: COLOR_SWATCH_STYLES[color].hex }}
                />
              )}
            </button>
            {colorOpen && (
              <div className={`absolute ${colorOpenUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"} ${colorAlignLeft ? "left-0" : "right-0"} z-50 p-1.5 rounded-[12px] border border-[#f3e8d5] bg-white shadow-xl grid grid-cols-4 gap-1 w-[164px] max-h-[calc(100dvh-24px)] overflow-y-auto`}>
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
                        selected ? "border-[#d12f20] ring-2 ring-[#c73123]" : "border-[#f5ecdd] hover:bg-[#faf6ef]"
                      }`}
                    >
                      {c === "none" ? (
                        <span className="text-sm font-black text-[#5f5951]">⊘</span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="w-5 h-5 rounded-full border border-[#eddcbf]"
                          style={{ backgroundColor: sw.hex }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Color: reflection */}
        {sensorType === "color" && effectiveModules.includes("reflection") && (
          <div className="flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton("reflection")}
            {renderLiveBadge("reflection")}
            <button
              type="button"
              aria-label="Условие сравнения отражения"
              title={op === "lt" ? "Темнее (<)" : "Светлее (>)"}
              onClick={() => onChange({ sensorOp: op === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] h-[36px] px-2 rounded-[9px] bg-white text-[#a8211a] font-extrabold text-xs flex items-center justify-center shadow-xs hover:bg-[#fbf8f2] whitespace-nowrap"
            >
              {getSensorComparisonWord("reflection", op)}
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
              className="w-[50px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#1d1b1a] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap pr-1">%</span>
          </div>
        )}

        {/* Force: pressed */}
        {sensorType === "force" && effectiveModules.includes("pressed") && (
          <div className="flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton("pressed")}
            {renderLiveBadge("pressed")}
            <button
              type="button"
              aria-label={pressed ? "Состояние: нажата" : "Состояние: отпущена"}
              aria-pressed={pressed}
              title={pressed ? "Нажат" : "Отпущен"}
              onClick={() => onChange({ sensorPressed: !pressed })}
              className="min-h-[36px] min-w-[36px] h-[36px] px-2.5 rounded-[9px] bg-white text-[#a8211a] font-black text-xs flex items-center gap-1 shadow-xs hover:bg-[#fbf8f2] whitespace-nowrap"
            >
              <span aria-hidden="true">{pressed ? "●" : "○"}</span>
              <span>{pressed ? "Нажат" : "Отпущен"}</span>
            </button>
          </div>
        )}

        {/* Force: force (N) */}
        {sensorType === "force" && effectiveModules.includes("force") && (
          <div className="flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton("force")}
            {renderLiveBadge("force")}
            <button
              type="button"
              aria-label="Условие сравнения силы"
              title={op === "lt" ? "Слабее (<)" : "Сильнее (>)"}
              onClick={() => onChange({ sensorOp: op === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] h-[36px] px-2 rounded-[9px] bg-white text-[#a8211a] font-extrabold text-xs flex items-center justify-center shadow-xs hover:bg-[#fbf8f2] whitespace-nowrap"
            >
              {getSensorComparisonWord("force", op)}
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
              className="w-[50px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#1d1b1a] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap pr-1">Н</span>
          </div>
        )}

        {/* IMU: heading */}
        {sensorType === "imu" && effectiveModules.includes("heading") && (
          <div className="flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton("heading")}
            {renderLiveBadge("heading")}
            <button
              type="button"
              aria-label="Условие сравнения курса"
              title={op === "lt" ? "Меньше (<)" : "Больше (>)"}
              onClick={() => onChange({ sensorOp: op === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] h-[36px] px-2 rounded-[9px] bg-white text-[#a8211a] font-extrabold text-xs flex items-center justify-center shadow-xs hover:bg-[#fbf8f2] whitespace-nowrap"
            >
              {getSensorComparisonWord("heading", op)}
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
              className="w-[54px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#1d1b1a] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap pr-1">°</span>
          </div>
        )}

        {/* IMU: tilt */}
        {sensorType === "imu" && effectiveModules.includes("tilt") && (
          <div className="flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton("tilt")}
            {renderLiveBadge("tilt")}
            <button
              type="button"
              aria-label={tiltAxis === "pitch" ? "Ось наклона: тангаж" : "Ось наклона: крен"}
              title={tiltAxis === "pitch" ? "Тангаж (↕)" : "Крен (↔)"}
              onClick={() => onChange({ sensorAxis: tiltAxis === "pitch" ? "roll" : "pitch" })}
              className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-[9px] bg-white text-[#a8211a] font-black text-sm grid place-items-center shadow-xs hover:bg-[#fbf8f2]"
            >
              {tiltAxis === "pitch" ? "↕" : "↔"}
            </button>
            <button
              type="button"
              aria-label="Условие сравнения наклона"
              title={tiltOp === "lt" ? "Меньше (<)" : "Больше (>)"}
              onClick={() => onChange({ sensorTiltOp: tiltOp === "lt" ? "gt" : "lt" })}
              className="min-h-[36px] h-[36px] px-2 rounded-[9px] bg-white text-[#a8211a] font-extrabold text-xs flex items-center justify-center shadow-xs hover:bg-[#fbf8f2] whitespace-nowrap"
            >
              {getSensorComparisonWord("tilt", tiltOp)}
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
              className="w-[52px] min-h-[36px] h-[36px] rounded-full px-1.5 text-center bg-white text-[#1d1b1a] font-extrabold text-sm shadow-xs"
            />
            <span className="text-xs font-extrabold whitespace-nowrap pr-1">°</span>
          </div>
        )}

        {/* IMU: reset (chain only) */}
        {sensorType === "imu" && !slotted && effectiveModules.includes("reset") && (
          <div className="flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton("reset")}
            <span className="min-h-[36px] h-[36px] px-2 rounded-[9px] bg-white/15 text-xs font-extrabold flex items-center whitespace-nowrap">
              0°
            </span>
          </div>
        )}

        {/* Lights (ultrasonic & color) */}
        {(sensorType === "ultrasonic" || sensorType === "color") && effectiveModules.includes("lights") && (
          <div className="flex flex-nowrap items-center gap-1.5 rounded-[12px] bg-black/20 px-2 py-1 shrink-0">
            {renderModulePopoverButton(
              "lights",
              <Lightbulb
                size={16}
                aria-hidden="true"
                className={`shrink-0 ${light === -1 ? "text-white/55" : "text-amber-200"}`}
              />
            )}
            <button
              type="button"
              aria-label={`Подсветка датчика: ${formatSensorLightLabel(light)}`}
              title={`Подсветка: ${formatSensorLightLabel(light)}`}
              onClick={() => onChange({ sensorLight: nextSensorLight(light) })}
              className={`min-h-[36px] min-w-[36px] h-[36px] px-2.5 rounded-[9px] font-black text-xs cursor-pointer flex items-center justify-center shrink-0 ${
                light === -1
                  ? "bg-white/25 text-white border border-white/35 hover:bg-white/35"
                  : "bg-white text-[#1d1b1a] shadow-xs hover:bg-[#fefce8]"
              }`}
            >
              {formatSensorLightLabel(light)}
            </button>
          </div>
        )}

        <div ref={menuRef} data-module-picker="true" className="relative shrink-0">
          <button
            type="button"
            aria-label="Добавить модуль датчика"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="min-h-[36px] min-w-[36px] h-[36px] w-[36px] rounded-full border border-white/55 bg-white/15 hover:bg-white/30 text-[#1d1b1a] text-lg leading-none font-black grid place-items-center"
          >
            +
          </button>
          {menuOpen && (
            <div className={`absolute ${menuOpenUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"} ${menuAlignLeft ? "left-0" : "right-0"} z-50 w-[184px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-24px)] overflow-y-auto p-1.5 rounded-[12px] border border-[#f3e8d5] bg-white text-[#1d1b1a] shadow-xl flex flex-col gap-1`}>
              {menuModules.map((mod) => {
                const { label, renderIcon } = SENSOR_MODULE_MENU_ITEMS[mod]
                const active = effectiveModules.includes(mod)
                const isOnlyRemaining = active && effectiveModules.length <= 1
                return (
                  <button
                    key={mod}
                    type="button"
                    aria-pressed={active}
                    disabled={isOnlyRemaining}
                    onClick={() => {
                      if (isOnlyRemaining) return
                      setMenuOpen(false)
                      setModules(
                        active
                          ? effectiveModules.filter((m) => m !== mod)
                          : [...effectiveModules, mod]
                      )
                    }}
                    className={`min-h-[36px] flex items-center gap-2 text-left px-3 py-1.5 rounded-lg text-xs font-extrabold disabled:opacity-60 ${
                      mod === "lights"
                        ? active
                          ? "bg-[#fef08a] hover:bg-[#fde047] text-[#854d0e]"
                          : "bg-[#fefce8] hover:bg-[#fef08a] text-[#854d0e]"
                        : active
                          ? "bg-[#f8f2e7] hover:bg-[#f2e7d3] text-[#a8211a]"
                          : "bg-[#fbf8f2] hover:bg-[#f8f2e7] text-[#a8211a]"
                    }`}
                  >
                    <Check size={14} aria-hidden="true" className={active ? "opacity-100 shrink-0" : "opacity-0 shrink-0"} />
                    {renderIcon(15)}
                    <span>{label}</span>
                  </button>
                )
              })}
              {slotted && onRemoveFromCondition && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onRemoveFromCondition()
                  }}
                  className="mt-1 border-t border-[#f5ecdd] pt-1.5 min-h-[36px] flex items-center gap-2 text-left px-3 py-1.5 rounded-lg bg-[#fef2f2] hover:bg-[#fee2e2] text-xs font-extrabold text-[#991b1b]"
                >
                  <Trash2 size={14} aria-hidden="true" className="shrink-0" />
                  <span>Убрать из условия</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!slotted && <BlockErrorBar errorMessage={errorMessage} />}
    </div>
  )
}
