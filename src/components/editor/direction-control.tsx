"use client"

import * as React from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Settings2 } from "lucide-react"

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
  const base = "grid shrink-0 place-items-center rounded-full border-2 border-slate-500 text-white shadow-[inset_0_-3px_#25313c] select-none"

  if (editing) return <span aria-hidden="true" className={`${base} bg-[#3a444d]`} style={style}>{arrow}</span>

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed && enabled}
      title={error || label}
      disabled={!enabled}
      className={`${base} cursor-pointer touch-none bg-[#3a444d] p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 aria-pressed:border-[#56bdad] aria-pressed:bg-[#0e7668] aria-pressed:shadow-[inset_0_3px_#09594e] disabled:opacity-55`}
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
        if (typeof key.current === "string") release(key.current)
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
  const bodyHeight = height - (editing ? 40 : 16)
  const size = Math.floor(Math.min(
    vertical ? bodyWidth : (bodyWidth - 8) / 2,
    vertical ? (bodyHeight - 8) / 2 : bodyHeight,
  ))

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
      <div className="absolute right-0 top-full grid w-max gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800 shadow-lg">
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
