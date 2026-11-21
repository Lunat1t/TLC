import React from "react"
import type { WorkspaceBlock, ControllerButton, ControllerEvent } from "@/lib/workspace"
import { CONTROLLER_BUTTONS, BUTTON_LABELS } from "@/lib/controller-program"
import {CONTROL_INPUTS, type ControlInstance} from "@/lib/control-workspace"

interface ControllerBlockProps {
  block: WorkspaceBlock
  ports: string[]
  isConnected: boolean
  hasChild: boolean
  errorMessage?: string
  controls?: ControlInstance[]
  onChange: (changes: Partial<WorkspaceBlock>) => void
}

const BUTTON_DESCRIPTIONS: Record<ControllerButton, string> = {
  up: "▲ Вверх",
  down: "▼ Вниз",
  left: "◀ Влево",
  right: "▶ Вправо",
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  l: "L (плечо)",
  r: "R (плечо)",
  blue: "Синяя кнопка",
  red: "Красная кнопка",
  green: "Зелёная кнопка",
  yellow: "Жёлтая кнопка",
}

const INPUT_ICONS: Record<string, string> = {
  up: "▲",
  down: "▼",
  left: "◀",
  right: "▶",
  forward: "▲",
  backward: "▼",
  blue: "🔵",
  red: "🔴",
  green: "🟢",
  yellow: "🟡",
}

function controlOptionLabel(control: ControlInstance, indexInKind: number, countInKind: number): string {
  const base =
    control.kind === "drive-turn"
      ? "◀ ▶"
      : control.kind === "drive-linear"
        ? "▲ ▼"
        : control.kind === "motor-panel"
          ? "🔵🔴"
          : control.label
  return countInKind > 1 ? `${base} #${indexInKind}` : base
}

export function ControllerButtonBlock({
  block,
  hasChild,
  errorMessage,
  controls,
  onChange,
}: ControllerBlockProps) {
  const buttonControls = controls?.filter(control => (control.inputs || CONTROL_INPUTS[control.kind]).length > 0)
  const currentButton = (block.button || "up") as ControllerButton
  const currentEvent = (block.event || "pressed") as ControllerEvent

  const kindCounts = new Map<string, number>()
  if (buttonControls) {
    for (const control of buttonControls) {
      kindCounts.set(control.kind, (kindCounts.get(control.kind) || 0) + 1)
    }
  }
  const kindProgress = new Map<string, number>()
  const selectedControl = buttonControls?.find(item => item.id === block.target?.controlId)

  return (
    <div className="flex flex-col">
      <div className="flex flex-nowrap items-center h-[58px] px-3 gap-1.5 text-white">
        <span aria-hidden="true" className="text-lg font-black shrink-0">
          🎮
        </span>

        {/* Цель обработчика — конкретный элемент и его кнопка. */}
        {buttonControls ? <>
          <select
            value={block.target?.controlId || ""}
            aria-label="Выбрать элемент управления"
            title="Элемент управления"
            onChange={e => {
              const control = buttonControls.find(item => item.id === e.target.value)
              onChange({
                target: {
                  controlId: e.target.value,
                  input: control ? (control.inputs || CONTROL_INPUTS[control.kind])[0] || "" : "",
                },
              })
            }}
            className="h-[34px] max-w-[92px] px-2 rounded-[9px] bg-white text-[#18313b] font-black text-xs border-2 border-[#c2410c] cursor-pointer"
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
                  {controlOptionLabel(control, idx, kindCounts.get(control.kind) || 1)}
                </option>
              )
            })}
          </select>
          <select
            value={block.target?.input || ""}
            aria-label="Выбрать кнопку элемента"
            title="Кнопка"
            onChange={e => onChange({ target: { controlId: block.target?.controlId || "", input: e.target.value } })}
            className="h-[34px] max-w-[68px] px-1.5 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#c2410c] cursor-pointer"
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
        </> : <select
          value={currentButton}
          aria-label="Выбрать кнопку пульта"
          onChange={(e) => onChange({ button: e.target.value as ControllerButton })}
          className="h-[34px] px-2 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#c2410c] shadow-sm cursor-pointer"
        >
          {CONTROLLER_BUTTONS.map((btn) => <option key={btn} value={btn}>{BUTTON_DESCRIPTIONS[btn] || BUTTON_LABELS[btn]}</option>)}
        </select>}

        {/* Выбор события: нажата / отпущена */}
        <select
          value={currentEvent}
          aria-label="Выбрать событие кнопки"
          title="Событие"
          onChange={(e) => onChange({ event: e.target.value as ControllerEvent })}
          className="h-[34px] px-2 rounded-[9px] bg-white text-[#18313b] font-black text-xs border-2 border-[#c2410c] shadow-sm cursor-pointer hover:bg-[#fff7ed] transition-colors focus:outline-none"
        >
          <option value="pressed">↓ нажата</option>
          <option value="released">↑ отпущена</option>
        </select>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mx-3 mb-2 px-2.5 py-1 rounded-[7px] bg-[#fef2f2] text-[#991b1b] text-[11px] font-black border border-[#fca5a5] flex items-center gap-1.5 shadow-sm"
        >
          <span aria-hidden="true">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  )
}

export function ControllerStopBlock({
  block,
  ports,
  errorMessage,
  onChange,
}: ControllerBlockProps) {
  const currentMotor = block.motor || "A"

  return (
    <div className="flex flex-col">
      <div className="flex flex-nowrap items-center h-[64px] px-5 gap-3 text-white">
        <span
          aria-hidden="true"
          className="w-[28px] h-[28px] rounded-[6px] bg-[#8f2a21] text-white font-black grid place-items-center text-sm shadow-inner"
        >
          ■
        </span>
        <span className="text-[16px] font-extrabold whitespace-nowrap tracking-tight">
          Стоп мотора
        </span>

        {/* Выбор порта */}
        <select
          value={currentMotor}
          aria-label="Выбрать порт мотора для остановки"
          onChange={(e) => onChange({ motor: e.target.value })}
          className="h-[36px] px-3 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#8f2a21] shadow-xs cursor-pointer hover:bg-[#fef2f2] transition-colors focus:outline-none"
        >
          {ports.map((port) => (
            <option key={port} value={port}>
              Порт {port}
            </option>
          ))}
        </select>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mx-3 mb-2 px-2.5 py-1 rounded-[7px] bg-[#fef2f2] text-[#991b1b] text-[11px] font-black border border-[#fca5a5] flex items-center gap-1.5 shadow-sm"
        >
          <span aria-hidden="true">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  )
}
