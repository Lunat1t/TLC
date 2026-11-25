"use client"

import * as React from "react"
import { Bluetooth } from "lucide-react"
import type { SessionState } from "@/lib/controller-runtime"
import type { BleSupport } from "@/components/editor/editor-dialogs"

type Transport = SessionState["transport"]

const MANUAL_HUB_PROGRAM = { href: "/hub_program.py", download: "tlc_pybricks_controller.py" } as const

function transportDotClass(transport: Transport) {
  switch (transport) {
    case "ready":
    case "connected":
      return "bg-emerald-500"
    case "connecting":
      return "bg-sky-500 animate-pulse"
    case "uploading":
    case "starting-hub":
      return "bg-[#087996] animate-pulse"
    case "fault":
      return "bg-red-500"
    default:
      return "bg-slate-400"
  }
}

function TransportLabel({ state }: { state: SessionState }) {
  switch (state.transport) {
    case "disconnected":
      return <><span className="max-sm:hidden">Робот</span><span className="sm:hidden">Нет</span></>
    case "connecting":
      return <>Поиск…</>
    case "uploading":
      return <>{`Загрузка ${state.uploadProgress ?? 0}%`}</>
    case "starting-hub":
      return <>Запуск…</>
    case "fault":
      return <>Нет связи</>
    default:
      return <>{state.hubName || (state.transport === "ready" ? "Готов" : "Подключён")}</>
  }
}

type RobotStatusMenuProps = {
  menuRef: React.Ref<HTMLDivElement>
  state: SessionState
  hub: "spike" | "ev3" | undefined
  bleSupport: BleSupport
  checking: boolean
  open: boolean
  onToggle: () => void
  onConnect: () => void
  onDisconnect: () => void
}

/** Top-bar pill with the robot connection state and its connect/disconnect menu. */
export function RobotStatusMenu({
  menuRef,
  state,
  hub,
  bleSupport,
  checking,
  open,
  onToggle,
  onConnect,
  onDisconnect,
}: RobotStatusMenuProps) {
  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Статус робота: ${state.message}`}
        onClick={onToggle}
        className="flex min-h-[40px] items-center gap-2 rounded-full border border-[#c6dce2] bg-[#f8fbfc] px-3 py-1.5 text-sm font-bold text-[#18313b] hover:bg-[#eff7fa]"
      >
        <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${transportDotClass(state.transport)}`} />
        <Bluetooth size={14} className="shrink-0 text-[#4c6b77] sm:hidden" aria-hidden="true" />
        <span className="truncate max-w-[116px]"><TransportLabel state={state} /></span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 rounded-2xl border border-[#dce8ec] bg-white p-3.5 shadow-xl flex flex-col gap-2.5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-[#57717d]">
              {state.hubName || (hub === "ev3" ? "LEGO EV3" : "SPIKE Prime")}
            </p>
            <p role="status" className="mt-0.5 text-xs font-medium text-[#18313b]">{state.message}</p>
          </div>
          {state.ports.length > 0 && (
            <p className="text-[11px] font-semibold text-[#57717d]">
              Порты моторов: {state.ports.join(", ")}
            </p>
          )}
          {hub === "ev3" ? (
            <p className="rounded-lg bg-[#f4f8fa] px-2.5 py-2 text-xs font-semibold text-[#475569]">
              Bluetooth в браузере доступен только для SPIKE Prime. Для EV3 используйте «Код Pybricks».
            </p>
          ) : bleSupport.checked && !bleSupport.available ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900">
              {bleSupport.reason} Доступны «Пробный режим» и «Код Pybricks».
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(state.transport === "disconnected" || state.transport === "fault") && (
                <button
                  type="button"
                  disabled={checking}
                  onClick={onConnect}
                  className="min-h-[40px] rounded-xl bg-[#087996] px-3 py-2 text-sm font-extrabold text-white hover:bg-[#06637a] disabled:opacity-40"
                >
                  {state.transport === "fault" ? "Переподключить робота" : "Подключить робота"}
                </button>
              )}
              {state.transport !== "disconnected" && (
                <button
                  type="button"
                  disabled={checking && state.transport !== "connecting"}
                  onClick={onDisconnect}
                  className="min-h-[38px] rounded-xl border border-[#dce8ec] px-3 py-2 text-xs font-bold text-[#31525f] hover:bg-[#f4f8fa] disabled:opacity-40"
                >
                  {state.transport === "connecting" ? "Отменить подключение" : "Отключить"}
                </button>
              )}
              {state.needsManualHubProgram && (
                <a className="mt-1 text-center text-xs font-semibold text-[#086985] underline" {...MANUAL_HUB_PROGRAM}>
                  На хабе не найден Pybricks: скачать программу вручную
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type RobotStatusBannerProps = {
  state: SessionState
  hub: "spike" | "ev3" | undefined
  bleSupport: BleSupport
  checking: boolean
  starting: boolean
  startError: string
  onReconnect: () => void
  onConnectAndStart: () => void
  onBackToEditor: () => void
}

/** Strip under the board toolbar: upload progress, faults and the check-mode hint. */
export function RobotStatusBanner({
  state,
  hub,
  bleSupport,
  checking,
  starting,
  startError,
  onReconnect,
  onConnectAndStart,
  onBackToEditor,
}: RobotStatusBannerProps) {
  const fault = state.transport === "fault"
  if (!checking && state.transport !== "uploading" && state.transport !== "starting-hub" && !fault && !startError) return null
  return (
    <div
      role={fault ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 text-xs font-semibold ${
        fault ? "border-red-200 bg-red-50 text-red-900" : "border-[#dce8ec] bg-[#f4fafc] text-[#31525f]"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate">{startError || state.message}</span>
        {state.transport === "uploading" && (
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#d3e8ef]">
            <div
              className="h-full bg-[#087996] transition-all duration-150"
              style={{ width: `${Math.max(5, state.uploadProgress ?? 0)}%` }}
            />
          </div>
        )}
      </div>
      {fault && hub === "spike" && (
        <div className="flex items-center gap-2 shrink-0">
          {state.needsManualHubProgram && (
            <a className="underline text-[#086985]" {...MANUAL_HUB_PROGRAM}>
              Скачать вручную
            </a>
          )}
          {bleSupport.available && (
            <button
              type="button"
              disabled={starting}
              onClick={onReconnect}
              className="rounded-lg bg-red-700 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-red-800 disabled:opacity-50"
            >
              Переподключить
            </button>
          )}
          {checking && (
            <button
              type="button"
              onClick={onBackToEditor}
              className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-bold text-red-900 hover:bg-red-100"
            >
              В редактор
            </button>
          )}
        </div>
      )}
      {checking && state.program === "trial-running" && !fault && hub === "spike" && bleSupport.available && (
        <button
          type="button"
          disabled={starting}
          onClick={onConnectAndStart}
          className="shrink-0 rounded-lg bg-[#087996] px-2.5 py-1 text-xs font-extrabold text-white hover:bg-[#06637a] disabled:opacity-50"
        >
          Подключить робота
        </button>
      )}
    </div>
  )
}
