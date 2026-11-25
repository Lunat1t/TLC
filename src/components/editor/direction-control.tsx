"use client"

import * as React from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Settings2, Waves } from "lucide-react"

import { DIRECTION_CONTROLS, type DirectionControlKind } from "@/lib/control-workspace"
import { DRIVE_PORTS, type DrivePort, type DriveSettings } from "@/lib/controller-program"

const DIRECTIONS = {
  up: { label: "Вперёд", icon: ArrowUp },
  down: { label: "Назад", icon: ArrowDown },
  left: { label: "Влево", icon: ArrowLeft },
  right: { label: "Вправо", icon: ArrowRight },
}
type Direction = keyof typeof DIRECTIONS
type InputEvent = "pressed" | "released"

function DirectionButton({
  direction, size, editing, active, error, onInput,
}: {
  direction: Direction
  size: number
  editing: boolean
  active: boolean
  error?: string
  onInput: (event: InputEvent) => void
}) {
  const { label, icon: Icon } = DIRECTIONS[direction]
  const key = React.useRef<number | string | null>(null)
  const [pressed, setPressed] = React.useState(false)
  const enabled = active && !error

  React.useEffect(() => {
    if (!enabled) {
      key.current = null
      setPressed(false)
    }
  }, [enabled])

  function start(owner: number | string) {
    if (key.current !== null) return
    key.current = owner
    setPressed(true)
    onInput("pressed")
  }

  function release(owner: number | string) {
    if (key.current !== owner) return
    key.current = null
    setPressed(false)
    onInput("released")
  }

  const arrow = <Icon size={Math.round(size * 0.5)} strokeWidth={3.5} aria-hidden="true" />
  const style = { width: size, height: size }
  const base = "grid shrink-0 place-items-center rounded-full border-2 border-stone-500 text-white shadow-[0_3px_0_rgba(38,36,35,0.16)] select-none"

  if (editing) return <span aria-hidden="true" className={`${base} bg-[#363331]`} style={style}>{arrow}</span>

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed && enabled}
      title={error || label}
      disabled={!enabled}
      className={`${base} cursor-pointer touch-none bg-[#363331] p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 aria-pressed:border-[#8a8093] aria-pressed:bg-[#353230] aria-pressed:shadow-[0_3px_0_rgba(38,36,35,0.16)] disabled:opacity-55`}
      style={style}
      onPointerDown={event => {
        if (event.button !== 0 || key.current !== null) return
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        start(event.pointerId)
      }}
      onPointerUp={event => release(event.pointerId)}
      onPointerCancel={event => release(event.pointerId)}
      onLostPointerCapture={event => release(event.pointerId)}
      onKeyDown={event => {
        if (event.key !== " " && event.key !== "Enter") return
        event.preventDefault()
        if (!event.repeat) start(event.key)
      }}
      onKeyUp={event => {
        if (event.key !== " " && event.key !== "Enter") return
        event.preventDefault()
        release(event.key)
      }}
      onBlur={() => {
        if (key.current !== null) release(key.current)
      }}
    >
      {arrow}
    </button>
  )
}

export function DirectionButtons({
  kind, width, height, editing, active, errors, onInput,
}: {
  kind: DirectionControlKind
  width: number
  height: number
  editing: boolean
  active: boolean
  errors: Partial<Record<Direction, string>>
  onInput: (direction: Direction, event: InputEvent) => void
}) {
  const vertical = kind === "drive-linear"
  const bodyWidth = width - 16
  const bodyHeight = height - 16
  const size = Math.max(24, Math.floor(Math.min(
    vertical ? bodyWidth : (bodyWidth - 8) / 2,
    vertical ? (bodyHeight - 8) / 2 : bodyHeight,
  )))

  return (
    <div className={`flex min-h-0 flex-1 items-center justify-center gap-2 ${vertical ? "flex-col" : ""}`}>
      {DIRECTION_CONTROLS[kind].inputs.map(direction => (
        <DirectionButton
          key={direction}
          direction={direction}
          size={size}
          editing={editing}
          active={active}
          error={errors[direction]}
          onInput={event => onInput(direction, event)}
        />
      ))}
    </div>
  )
}


export function DirectionPalettePreview({ kind }: { kind: DirectionControlKind }) {
  const vertical = kind === "drive-linear"
  const btnSize = vertical ? "size-5" : "size-6"
  const iconSize = vertical ? 12 : 13
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center ${vertical ? "flex-col gap-1" : "gap-1.5"}`}
    >
      {DIRECTION_CONTROLS[kind].inputs.map(direction => {
        const Icon = DIRECTIONS[direction].icon
        return (
          <span
            key={direction}
            className={`grid ${btnSize} place-items-center rounded-full border-[1.5px] border-stone-500 bg-[#363331] text-white shadow-[0_3px_0_rgba(38,36,35,0.16)]`}
          >
            <Icon size={iconSize} strokeWidth={3.2} />
          </span>
        )
      })}
    </span>
  )
}


const PALETTE_MOTOR_DOTS = [
  { face: "#6f3fb0", shade: "#382d3b" },
  { face: "#d9473d", shade: "#a92b26" },
  { face: "#32a66a", shade: "#21804e" },
  { face: "#edc13d", shade: "#756b7e" },
] as const

export function DistanceGaugePalettePreview() {
  return (
    <span aria-hidden="true" className="flex items-center justify-center gap-1.5 text-[#58505e]">
      <Waves size={16} strokeWidth={2.4} />
      <span className="rounded-md bg-[#ecf5f9] px-2 py-0.5 text-xs font-bold tabular-nums">-- см</span>
    </span>
  )
}

export function MotorButtonsPalettePreview() {
  return (
    <span aria-hidden="true" className="flex items-center justify-center gap-1.5">
      {PALETTE_MOTOR_DOTS.map((dot, index) => (
        <span
          key={index}
          className="size-5 rounded-full border border-black/10"
          style={{ background: dot.face, boxShadow: `inset 0 -2px ${dot.shade}` }}
        />
      ))}
    </span>
  )
}

export function DriveSettingsButton({ settings, onChange }: {
  settings: DriveSettings
  onChange: (settings: DriveSettings) => void
}) {
  function selectPort(side: "leftPort" | "rightPort", port: DrivePort) {
    const other = side === "leftPort" ? "rightPort" : "leftPort"
    onChange({
      ...settings,
      [side]: port,
      [other]: settings[other] === port ? settings[side] : settings[other],
    })
  }

  return (
    <details
      className="absolute right-9 top-1 z-30"
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      <summary
        aria-label="Порты моторов движения"
        title="Порты моторов движения"
        className="grid size-8 cursor-pointer list-none place-items-center rounded-md text-white hover:bg-black/15 [&::-webkit-details-marker]:hidden"
      >
        <Settings2 size={17} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 top-full grid w-max gap-2 rounded-lg border border-stone-200 bg-white p-2 text-xs font-semibold text-stone-800 shadow-lg">
        {([
          { label: "Левый мотор", port: "leftPort", reversed: "leftReversed" },
          { label: "Правый мотор", port: "rightPort", reversed: "rightReversed" },
        ] as const).map(({ label, port, reversed }) => (
          <div key={port} className="flex items-center gap-2">
            <label className="flex flex-1 items-center justify-between gap-2">
              {label}
              <select
                aria-label={label}
                className="rounded border bg-white px-1 py-1"
                value={settings[port]}
                onChange={event => selectPort(port, event.target.value as DrivePort)}
              >
                {DRIVE_PORTS.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" aria-label={`Инверсия: ${label.toLowerCase()}`} checked={settings[reversed]} onChange={event => onChange({ ...settings, [reversed]: event.target.checked })} />
              Инверсия
            </label>
          </div>
        ))}
      </div>
    </details>
  )
}
