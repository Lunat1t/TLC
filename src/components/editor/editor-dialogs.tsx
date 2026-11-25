"use client"

import * as React from "react"
import Link from "next/link"
import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { enterEditorLandscape } from "@/lib/editor-orientation"
import { clampChassisSpeed } from "@/lib/editor-layout"
import type { DrivePort, DriveSettings } from "@/lib/controller-program"

export type BleSupport = { checked: boolean; available: boolean; reason: string }

function closeOnBackdrop(onClose: () => void) {
  return (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }
}

type RunPromptDialogProps = {
  bleSupport: BleSupport
  /** The previous Bluetooth connection failed. */
  connectionLost: boolean
  /** The run was requested from the Pybricks code editor rather than blocks. */
  pybricksRun: boolean
  onConnectAndStart: () => void
  onTrialRun: () => void
  onDownloadCode: () => void
  onClose: () => void
}

/** Asks how to run the program when no robot is connected. */
export function RunPromptDialog({
  bleSupport,
  connectionLost,
  pybricksRun,
  onConnectAndStart,
  onTrialRun,
  onDownloadCode,
  onClose,
}: RunPromptDialogProps) {
  const bleUnavailable = bleSupport.checked && !bleSupport.available
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Запуск программы"
      onClick={closeOnBackdrop(onClose)}
      className="fixed inset-0 z-50 bg-[#112a36]/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full max-w-[420px] rounded-t-[24px] sm:rounded-[20px] bg-white p-5 pb-6 sm:pb-5 shadow-2xl border border-[#dce8ec]">
        <h2 className="text-lg font-black text-[#18313b]">
          {bleUnavailable
            ? "Bluetooth недоступен в этом браузере"
            : connectionLost
              ? "Связь с роботом потеряна"
              : "Робот ещё не подключён"}
        </h2>
        <p className="mt-1.5 text-sm text-[#475569]">
          {bleUnavailable
            ? pybricksRun
              ? `${bleSupport.reason} Вы можете скачать файл .py и запустить его в Pybricks Code.`
              : `${bleSupport.reason} Можно проверить управление в пробном режиме или открыть код Pybricks.`
            : connectionLost
              ? "Переподключите хаб по Bluetooth, и программа сразу запустится."
              : pybricksRun
                ? "Подключите хаб по Bluetooth — код скомпилируется и сразу запустится на SPIKE Prime."
                : "IDE сама подготовит хаб по Bluetooth и сразу запустит ваше управление."}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {!bleUnavailable && (
            <Button
              type="button"
              onClick={onConnectAndStart}
              className="min-h-[44px] w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-sm font-extrabold text-white"
            >
              {connectionLost ? "Переподключить и запустить" : "Подключить и запустить"}
            </Button>
          )}
          {!pybricksRun && (
            <Button
              type="button"
              variant={bleUnavailable ? "default" : "outline"}
              onClick={onTrialRun}
              className={`min-h-[44px] w-full rounded-xl text-sm font-bold ${
                bleUnavailable
                  ? "bg-[#087996] hover:bg-[#06637a] text-white font-extrabold"
                  : "border-[#c6dce2] text-[#18313b]"
              }`}
            >
              Пробный режим (без робота)
            </Button>
          )}
          {bleUnavailable && (
            <Button
              type="button"
              variant="outline"
              onClick={onDownloadCode}
              className="min-h-[44px] w-full rounded-xl border-[#c6dce2] text-sm font-bold text-[#086985]"
            >
              {pybricksRun ? "Скачать .py" : "Код Pybricks (.py)"}
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-1 min-h-[40px] text-xs font-bold text-[#57717d] hover:text-[#18313b]"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

type ChassisDialogProps = {
  initialSettings: DriveSettings
  motorPorts: readonly string[]
  onCancel: () => void
  /** Persist the settings; resolves true when the dialog may close. */
  onSave: (settings: DriveSettings) => Promise<boolean>
}

const CHASSIS_SIDES = [
  { label: "Левый мотор", portKey: "leftPort", revKey: "leftReversed" },
  { label: "Правый мотор", portKey: "rightPort", revKey: "rightReversed" },
] as const

/** Ports, direction and base speed of the project's drive base. */
export function ChassisDialog({ initialSettings, motorPorts, onCancel, onSave }: ChassisDialogProps) {
  const [draft, setDraft] = React.useState<DriveSettings>(() => ({
    ...initialSettings,
    speed: initialSettings.speed ?? 360,
  }))
  const [saving, setSaving] = React.useState(false)

  async function save() {
    setSaving(true)
    try {
      if (await onSave({ ...draft, speed: clampChassisSpeed(draft.speed) })) onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Настройки шасси"
      onClick={closeOnBackdrop(onCancel)}
      className="fixed inset-0 z-50 bg-[#112a36]/50 grid place-items-center p-4"
    >
      <div className="w-full max-w-[380px] rounded-[20px] border border-[#dce8ec] bg-white p-5 text-[#18313b] shadow-2xl">
        <h2 className="text-lg font-black mb-3">Настройки шасси</h2>
        <div className="flex flex-col gap-3">
          {CHASSIS_SIDES.map(({ label, portKey, revKey }) => (
            <div key={portKey} className="flex items-center justify-between gap-2 rounded-xl border border-[#e1eaee] bg-[#f8fbfc] px-3 py-2">
              <span className="text-sm font-bold">{label}</span>
              <div className="flex items-center gap-2">
                <select
                  aria-label={label}
                  value={draft[portKey]}
                  onChange={(e) => {
                    const port = e.target.value as DrivePort
                    const otherKey = portKey === "leftPort" ? "rightPort" : "leftPort"
                    // Picking the other side's port swaps the two motors.
                    setDraft((prev) => ({
                      ...prev,
                      [portKey]: port,
                      [otherKey]: prev[otherKey] === port ? prev[portKey] : prev[otherKey],
                    }))
                  }}
                  className="min-h-[36px] h-[36px] rounded-lg border border-[#c6dce2] bg-white px-2.5 text-sm font-black"
                >
                  {motorPorts.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  type="button"
                  aria-label={`Инверсия: ${label.toLowerCase()}`}
                  aria-pressed={draft[revKey]}
                  title={draft[revKey] ? "Реверс (↺)" : "Прямо (↻)"}
                  onClick={() => setDraft((prev) => ({ ...prev, [revKey]: !prev[revKey] }))}
                  className={`min-h-[36px] min-w-[36px] h-[36px] px-2.5 rounded-lg border text-sm font-black flex items-center gap-1 ${
                    draft[revKey]
                      ? "border-[#087996] bg-[#e7f4f8] text-[#086985]"
                      : "border-[#c6dce2] bg-white text-[#31525f]"
                  }`}
                >
                  <span>{draft[revKey] ? "↺" : "↻"}</span>
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#e1eaee] bg-[#f8fbfc] px-3 py-2">
            <label htmlFor="chassis-speed-input" className="text-sm font-bold">Базовая скорость</label>
            <div className="flex items-center gap-1.5">
              <input
                id="chassis-speed-input"
                type="number"
                min="1"
                max="1000"
                value={draft.speed ?? 360}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  if (!Number.isFinite(val)) return
                  setDraft((prev) => ({ ...prev, speed: clampChassisSpeed(val) }))
                }}
                className="w-[80px] min-h-[36px] h-[36px] rounded-lg border border-[#c6dce2] bg-white px-2 text-center text-sm font-black"
              />
              <span className="text-xs font-bold text-[#57717d]">°/с</span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-[40px]" onClick={onCancel}>Отмена</Button>
          <Button
            type="button"
            disabled={saving}
            className="min-h-[40px] bg-[#087996] hover:bg-[#06637a] text-white font-extrabold"
            onClick={() => void save()}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Explains why a motor panel button cannot be pressed right now. */
export function PanelErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Кнопка недоступна"
      onClick={closeOnBackdrop(onClose)}
      className="fixed inset-0 z-50 bg-[#112a36]/50 grid place-items-center p-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#dfae87] bg-white p-5 text-[#18313b] shadow-xl">
        <h2 className="mb-3 text-lg font-extrabold">Кнопка недоступна</h2>
        <p className="whitespace-pre-line text-sm">{message}</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-full bg-[#0e7668] px-4 py-2 font-bold text-white"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}

/** Full-screen blocker shown on touch devices held in portrait. */
export function LandscapeGuard() {
  const rotateButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const [manualHint, setManualHint] = React.useState(false)
  React.useEffect(() => { rotateButtonRef.current?.focus() }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-landscape-title"
      className="fixed inset-0 z-[13000] grid place-items-center bg-[#0f2430]/92 p-6 text-white backdrop-blur-md"
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#163140] p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#087996]/25 text-[#5eead4]">
          <RotateCw size={28} aria-hidden="true" />
        </div>
        <h2 id="editor-landscape-title" className="text-xl font-black tracking-tight">
          Поверните экран горизонтально
        </h2>
        <p className="mt-2 text-sm text-[#c7dce4]">
          Редактор работает только в альбомном режиме
        </p>
        {manualHint && (
          <p role="status" className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-[#e0f2fe]">
            Поверните устройство вручную
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            ref={rotateButtonRef}
            type="button"
            onClick={async () => {
              const outcome = await enterEditorLandscape({
                target: document.documentElement,
                doc: document,
                orientation: window.screen?.orientation,
              })
              if (outcome === "manual") setManualHint(true)
            }}
            className="min-h-[44px] w-full rounded-xl bg-[#087996] px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-[#06637a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]"
          >
            Перейти в горизонт
          </button>
          <Link
            href="/dashboard"
            className="grid min-h-[44px] w-full place-items-center rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-[#e2f1f6] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5eead4]"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  )
}
