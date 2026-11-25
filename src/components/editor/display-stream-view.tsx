"use client"

import { useEffect, useRef, useState } from "react"
import { QrCode, X } from "lucide-react"
import { DisplayDiagnostics } from "./display-diagnostics"
import { requestLowDelay } from "@/lib/display-diagnostics"

import {
  closeDisplaySignal,
  createDisplaySignal,
  publishDisplaySignal,
  readDisplaySignal,
  pollActiveDisplaySignal,
  type DisplaySignalHealth,
  waitForDisplayIce,
  waitForDisplayPoll,
} from "@/lib/display-stream"

type DisplaySession = {
  abort: AbortController
  peer: RTCPeerConnection
  token?: string
}

function endSession(session: DisplaySession) {
  session.abort.abort()
  session.peer.close()
  if (session.token) void closeDisplaySignal(session.token)
}

export function DisplayStreamView({ editing }: { editing: boolean }) {
  const current = useRef<DisplaySession | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [diagnosticPeer, setDiagnosticPeer] = useState<RTCPeerConnection | null>(null)
  const [signaling, setSignaling] = useState<DisplaySignalHealth>("online")
  const [lowDelayRequested, setLowDelayRequested] = useState(false)
  const [qr, setQr] = useState("")
  const [status, setStatus] = useState<"idle" | "starting" | "waiting" | "connecting" | "live">("idle")
  const [error, setError] = useState("")

  useEffect(() => {
    function cleanup() {
      const session = current.current
      current.current = null
      if (session) endSession(session)
    }
    function pageExit() {
      cleanup()
      if (video.current) video.current.srcObject = null
      dialog.current?.close()
      setStatus("idle")
      setDiagnosticPeer(null)
      setQr("")
    }
    window.addEventListener("pagehide", pageExit)
    return () => {
      window.removeEventListener("pagehide", pageExit)
      cleanup()
    }
  }, [])

  function stop(message = "") {
    const session = current.current
    current.current = null
    if (session) endSession(session)
    if (video.current) video.current.srcObject = null
    dialog.current?.close()
    setQr("")
    setError(message)
    setStatus("idle")
    setDiagnosticPeer(null)
  }

  async function start() {
    if (current.current) return
    if (!window.isSecureContext || location.protocol !== "https:" || /^(localhost$|127\.|\[::1\]$)/.test(location.hostname)) {
      setError("Откройте Brick Studio по HTTPS-адресу, доступному с телефона.")
      return
    }

    let peer: RTCPeerConnection
    try {
      peer = new RTCPeerConnection({ iceServers: [] })
    } catch {
      setError("Этот браузер не поддерживает WebRTC.")
      return
    }

    const session: DisplaySession = { abort: new AbortController(), peer }
    current.current = session
    setDiagnosticPeer(peer)
    setSignaling("online")
    const { signal } = session.abort
    setError("")
    setStatus("starting")
    let connectionTimer: ReturnType<typeof setTimeout> | undefined
    signal.addEventListener("abort", () => clearTimeout(connectionTimer), { once: true })
    try {
      const { offerToken, answerToken } = await createDisplaySignal(signal)
      session.token = offerToken
      signal.throwIfAborted()
      peer.ontrack = event => {
        const element = video.current
        if (element && !signal.aborted) {
          element.srcObject = event.streams[0] ?? new MediaStream([event.track])
          void element.play().catch(() => {})
        }
      }
      peer.onconnectionstatechange = () => {
        if (signal.aborted) return
        if (peer.connectionState === "failed") {
          stop("Телефон недоступен. Проверьте, что оба устройства подключены к одной сети Wi‑Fi.")
        } else if (peer.connectionState === "connected") {
          clearTimeout(connectionTimer)
        } else if (peer.connectionState === "disconnected") {
          clearTimeout(connectionTimer)
          connectionTimer = setTimeout(() => stop("Связь с телефоном не восстановилась. Откройте новый QR-код."), 10000)
        }
      }
      const transceiver = peer.addTransceiver("video", { direction: "recvonly" })
      setLowDelayRequested(requestLowDelay(transceiver.receiver))
      await peer.setLocalDescription(await peer.createOffer())
      await publishDisplaySignal(offerToken, await waitForDisplayIce(peer, signal), signal)

      const url = new URL("/display-camera", location.origin)
      url.hash = answerToken
      const { toDataURL } = await import("qrcode")
      const image = await toDataURL(url.toString(), { width: 360, margin: 4, errorCorrectionLevel: "M" })
      signal.throwIfAborted()
      setQr(image)
      setStatus("waiting")

      const expires = Date.now() + 5 * 60_000
      let answer = await readDisplaySignal(offerToken, signal)
      while (!answer && Date.now() < expires) {
        await waitForDisplayPoll(1000, signal)
        answer = await readDisplaySignal(offerToken, signal)
      }
      if (answer?.type !== "answer") throw new Error("Срок QR-кода истёк. Создайте новый код.")

      setStatus("connecting")
      connectionTimer = setTimeout(() => stop("Прямое соединение не установилось. Проверьте Wi‑Fi."), 15000)
      await peer.setRemoteDescription(answer)
      while (!signal.aborted) {
        await waitForDisplayPoll(4000, signal)
        const health = await pollActiveDisplaySignal(offerToken, signal)
        if (!signal.aborted) setSignaling(health)
      }
    } catch (cause) {
      if (!signal.aborted) stop(cause instanceof Error ? cause.message : "Не удалось открыть трансляцию.")
    }
  }

  const showVideo = status === "connecting" || status === "live"
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-[#1e1c1b] p-2 text-white" aria-label="Экран дисплея">
      <video
        ref={video}
        className={`absolute inset-0 size-full object-contain ${showVideo ? "" : "invisible"}`}
        playsInline
        autoPlay
        muted
        onPlaying={() => {
          if (!current.current) return
          setStatus("live")
          setQr("")
          dialog.current?.close()
        }}
      />
      {status === "idle" && (
        <div className="grid max-h-full gap-1 overflow-y-auto text-center">
          <button
            type="button"
            onClick={() => void start()}
            className="mx-auto inline-flex min-h-9 items-center gap-2 rounded-md bg-white/10 px-2 text-xs font-bold hover:bg-white/20 focus-visible:outline focus-visible:outline-2"
          >
            <QrCode size={17} aria-hidden="true" /> Подключить телефон
          </button>
          {error && <p role="status" className="text-[11px] leading-snug text-rose-200">{error}</p>}
        </div>
      )}
      {status === "waiting" && qr && (
        <button type="button" aria-label="Увеличить QR-код" onClick={() => dialog.current?.showModal()} className="grid h-full min-h-0 place-items-center">
          {/* The generated data URL is local to this video session. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR-код для камеры телефона" className="block h-full min-h-0 max-w-full object-contain" />
        </button>
      )}
      {(status === "starting" || status === "connecting") && (
        <p role="status" className="relative px-4 text-center text-xs">{status === "starting" ? "Создаём QR-код…" : "Подключаем камеру…"}</p>
      )}
      {status !== "idle" && (
        <button type="button" onClick={() => stop()} title="Отключить трансляцию" aria-label="Отключить трансляцию"
          className={`absolute right-1 top-1 grid size-8 place-items-center rounded-md bg-[#1e1c1b]/90 hover:bg-[#373332] ${editing ? "" : "focus-visible:outline focus-visible:outline-2"}`}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
      <DisplayDiagnostics peer={diagnosticPeer} videoRef={video} signaling={signaling} lowDelayRequested={lowDelayRequested} />
      <dialog ref={dialog} aria-label="Подключение камеры телефона" className="m-auto max-w-[calc(100vw-24px)] rounded-md bg-white p-4 text-center text-stone-900 backdrop:bg-stone-950/60">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">Откройте QR-код камерой телефона</p>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Закрыть QR-код" className="grid size-8 place-items-center rounded-md hover:bg-stone-100">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR-код для камеры телефона" width={320} height={320} className="mx-auto size-auto max-h-[65vh] max-w-full" />
        )}
        <p className="text-xs text-stone-600">Оба устройства должны быть в одной сети Wi‑Fi.</p>
      </dialog>
    </div>
  )
}
