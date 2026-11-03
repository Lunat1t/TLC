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
}

export function ControllerButtonBlock({
  block,
  hasChild,
  errorMessage,
  controls,
  onChange,
}: ControllerBlockProps) {
  const currentButton = (block.button || "up") as ControllerButton
  const currentEvent = (block.event || "pressed") as ControllerEvent

  return (
    <div className="flex flex-col">
      <div className="flex flex-nowrap items-center h-[58px] px-5 gap-3 text-white">
        <span aria-hidden="true" className="text-xl font-black">
          🎮
        </span>
        <span className="text-[16px] font-extrabold whitespace-nowrap tracking-tight">
          Когда кнопка
        </span>

        {/* Цель обработчика — конкретный элемент и его кнопка. */}
        {controls ? <>
          <select value={block.target?.controlId || ""} aria-label="Выбрать элемент управления" onChange={e=>onChange({target:{controlId:e.target.value,input:""}})} className="h-[36px] max-w-[150px] px-2 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#c2410c]">
            <option value="">Выберите управление</option>
            {block.target?.controlId && !controls.some(c=>c.id===block.target?.controlId) && <option value={block.target.controlId}>Удалённое управление</option>}
            {controls.map(c=><option key={c.id} value={c.id}>{c.label} · {c.id.slice(-5)}</option>)}
          </select>
          <select value={block.target?.input || ""} aria-label="Выбрать кнопку элемента" onChange={e=>onChange({target:{controlId:block.target?.controlId || "",input:e.target.value}})} className="h-[36px] max-w-[100px] px-2 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#c2410c]">
            <option value="">Кнопка</option>
            {(() => {const c=controls.find(item=>item.id===block.target?.controlId);return c ? CONTROL_INPUTS[c.kind].map(input=><option key={input} value={input}>{({up:'▲',down:'▼',left:'◀',right:'▶',forward:'▲',backward:'▼'} as Record<string,string>)[input] || input.toUpperCase()}</option>) : null})()}
          </select>
        </> : <select
          value={currentButton}
          aria-label="Выбрать кнопку пульта"
          onChange={(e) => onChange({ button: e.target.value as ControllerButton })}
          className="h-[36px] px-2.5 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#c2410c] shadow-xs cursor-pointer"
        >
          {CONTROLLER_BUTTONS.map((btn) => <option key={btn} value={btn}>{BUTTON_DESCRIPTIONS[btn] || BUTTON_LABELS[btn]}</option>)}
        </select>}

        {/* Выбор события: нажата / отпущена */}
        <select
          value={currentEvent}
          aria-label="Выбрать событие кнопки"
          onChange={(e) => onChange({ event: e.target.value as ControllerEvent })}
          className="h-[36px] px-2.5 rounded-[9px] bg-white text-[#18313b] font-black text-sm border-2 border-[#c2410c] shadow-xs cursor-pointer hover:bg-[#fff7ed] transition-colors focus:outline-none"
        >
          <option value="pressed">нажата</option>
          <option value="released">отпущена</option>
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
