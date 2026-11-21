"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { Activity } from "lucide-react"
import { measureDisplay, type DisplayMetrics, type DisplaySample } from "@/lib/display-diagnostics"
import type { DisplaySignalHealth } from "@/lib/display-stream"

type FrameTiming = { lastFrameAt?: number; presentedFrames?: number; captureMs?: number; receiveMs?: number }
type Snapshot = DisplayMetrics & FrameTiming & { frameAgeMs?: number; displayFps?: number; sampledAt: string }

export function DisplayDiagnostics({ peer, videoRef, track, signaling, lowDelayRequested }: {
  peer: RTCPeerConnection | null
  videoRef: RefObject<HTMLVideoElement | null>
  track?: MediaStreamTrack
  signaling: DisplaySignalHealth
  lowDelayRequested?: boolean
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const timing = useRef<FrameTiming>({})
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    setSnapshot(null)
    setUnavailable(false)
    timing.current = {}
    if (!peer) return
    let disposed = false
    let previous: DisplaySample | undefined
    let previousPresentation: { at: number; frames: number } | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let frameCallback: number | undefined
    const element = videoRef.current
    if (element && typeof element.requestVideoFrameCallback === "function") {
      const frame = (now: number, metadata: VideoFrameCallbackMetadata) => {
        if (disposed) return
        const extra = metadata as VideoFrameCallbackMetadata & { captureTime?: number; receiveTime?: number }
        const delay = (start?: number) => typeof start === "number" && Number.isFinite(start) && metadata.expectedDisplayTime >= start
          ? metadata.expectedDisplayTime - start : undefined
        timing.current = { lastFrameAt: now, presentedFrames: metadata.presentedFrames, captureMs: delay(extra.captureTime), receiveMs: delay(extra.receiveTime) }
        frameCallback = element.requestVideoFrameCallback(frame)
      }
      frameCallback = element.requestVideoFrameCallback(frame)
    }
    async function sample() {
      try {
        const report = await peer!.getStats()
        if (disposed) return
        const { metrics, sample: baseline } = measureDisplay(report, peer!.connectionState, previous, performance.now(), track)
        previous = baseline
        const frame = timing.current
        const now = performance.now()
        const displayFps = frame.presentedFrames !== undefined && previousPresentation && now > previousPresentation.at && frame.presentedFrames >= previousPresentation.frames
          ? 1000 * (frame.presentedFrames - previousPresentation.frames) / (now - previousPresentation.at) : undefined
        if (frame.presentedFrames !== undefined) previousPresentation = { at: now, frames: frame.presentedFrames }
        setSnapshot({
          ...metrics, ...frame, displayFps,
          frameAgeMs: frame.lastFrameAt === undefined ? undefined : performance.now() - frame.lastFrameAt,
          sampledAt: new Date().toISOString(),
        })
        setUnavailable(false)
      } catch {
        if (!disposed) { setUnavailable(true); setSnapshot(null) }
      } finally {
        if (!disposed) timer = setTimeout(() => void sample(), 1000)
      }
    }
    void sample()
    return () => {
      disposed = true
      clearTimeout(timer)
      if (frameCallback !== undefined) element?.cancelVideoFrameCallback(frameCallback)
    }
  }, [peer, videoRef, track])

  if (!peer) return null
  const value = (number?: number, unit = "") => number === undefined ? "—" : number.toFixed(1) + unit
  const signalLabel = signaling === "online" ? "доступна" : signaling === "expired" ? "сессия закрыта; видео независимо" : "недоступна; повторяем"
  const fields: [string, string][] = [
    ["Соединение", snapshot?.connection || "ожидание"],
    ["Маршрут", snapshot?.route === "direct" ? "прямой (не доказывает LAN)" : snapshot?.route === "relay" ? "через relay" : "—"],
    ["Транспорт", snapshot?.protocol?.toUpperCase() || "—"],
    ["ICE", [snapshot?.localType, snapshot?.remoteType].filter(Boolean).join(" ↔ ") || "—"],
    ["RTT, не задержка видео", value(snapshot?.rttMs, " мс")],
    ["Видео", [snapshot?.codec, snapshot?.width && snapshot?.height ? snapshot.width + "×" + snapshot.height : ""].filter(Boolean).join(" · ") || "—"],
    ["FPS кодека / поток", value(snapshot?.fps) + " / " + value(snapshot?.bitrateKbps, " кбит/с")],
    ["FPS показа", value(snapshot?.displayFps)],
    ["Камера (настройка)", snapshot?.capture ? [snapshot.capture.width, snapshot.capture.height].join("×") + " · " + value(snapshot.capture.frameRate, " fps") : "—"],
    ["Кодирование / кадр", value(snapshot?.encodeMs, " мс")],
    ["Декодирование / кадр", value(snapshot?.decodeMs, " мс")],
    ["Буфер / кадр", value(snapshot?.bufferMs, " мс")],
    ["Jitter / потери", value(snapshot?.jitterMs, " мс") + " / " + value(snapshot?.lossPercent, "%")],
    [track ? "Захват → предпросмотр" : "Захват → показ (оценка)", value(snapshot?.captureMs, " мс")],
    ["Получение → показ", value(snapshot?.receiveMs, " мс")],
    ["Последний показанный кадр", value(snapshot?.frameAgeMs, " мс назад")],
    ["Зависания / отброшено", value(snapshot?.freezes) + " / " + value(snapshot?.droppedFrames)],
    ["Ограничение кодировщика", snapshot?.qualityLimit || "—"],
    [track ? "Запрошен профиль" : "Буфер 0 мс запрошен", track ? "motion / maintain-framerate" : lowDelayRequested ? "да; браузер выбирает фактический" : "нет / не поддерживается"],
    ["Облачная сигнализация", signalLabel],
  ]
  function download() {
    const { lastFrameAt: _lastFrameAt, ...safe } = snapshot || {}
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...safe, view: track ? "camera-preview" : "remote-display", signaling, lowDelayRequested }, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "brickstudio-video-diagnostics.json"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="absolute bottom-1 left-1 z-20 max-w-[calc(100%-8px)] text-left text-white" onPointerDown={event => event.stopPropagation()}>
      <button type="button" onClick={() => dialog.current?.showModal()} aria-label="Диагностика видео" title="Диагностика видео" className="grid size-8 cursor-pointer place-items-center rounded-md bg-slate-950/90 focus-visible:outline focus-visible:outline-2">
        <Activity size={17} aria-hidden="true" />
      </button>
      <dialog ref={dialog} role="dialog" aria-label="Диагностика видеосвязи" className="m-auto max-h-[75vh] w-80 max-w-[calc(100vw-24px)] overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-white shadow-lg backdrop:bg-black/50">
        <button type="button" aria-label="Закрыть диагностику" className="float-right grid size-8 place-items-center rounded border border-white/30 focus-visible:outline" onClick={() => dialog.current?.close()}>×</button>
        <p className="mb-2 font-bold">Диагностика видео{unavailable ? " · статистика недоступна" : ""}</p>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1">{fields.map(([label, text]) => <div key={label} className="contents"><dt className="text-slate-300">{label}</dt><dd>{text}</dd></div>)}</dl>
        <p className="mt-2 text-slate-300">«—» — браузер не сообщил данные. Оценка захвата не заменяет замер камерой. На телефоне показ — только локальный предпросмотр. FPS и буфер обновляются раз в секунду.</p>
        <button type="button" className="mt-2 rounded border border-white/30 px-2 py-1 focus-visible:outline" onClick={download}>Скачать замер</button>
      </dialog>
    </div>
  )
}
