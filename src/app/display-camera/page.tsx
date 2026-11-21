"use client"

import { useEffect, useRef, useState } from "react"
import { Video } from "lucide-react"
import { DisplayDiagnostics } from "@/components/editor/display-diagnostics"

import {
  closeDisplaySignal,
  publishDisplaySignal,
  readDisplaySignal,
  pollActiveDisplaySignal,
  type DisplaySignalHealth,
  waitForDisplayIce,
  waitForDisplayPoll,
} from "@/lib/display-stream"

const TOKEN_PATTERN = /^[a-f0-9]{64}$/
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 32, max: 32 },
  },
}

type CameraSession = {
  token: string
  abort: AbortController
  stream?: MediaStream
  peer?: RTCPeerConnection
  published: boolean
}

const PENDING_CONNECTION_MS = 20_000
const LOST_CONNECTION_MS = 6_000

function disposeCamera(session: CameraSession, close: boolean) {
  session.abort.abort()
  session.stream?.getTracks().forEach(track => track.stop())
  session.peer?.close()
  if (close) void closeDisplaySignal(session.token)
}

function errorText(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Разрешите доступ к камере в настройках браузера."
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "Камера на этом телефоне недоступна."
  }
  if (error instanceof DOMException && error.name === "NotReadableError") {
    return "Камеру использует другое приложение."
  }
  return error instanceof Error ? error.message : "Не удалось запустить камеру."
}

export default function DisplayCameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const active = useRef<CameraSession | null>(null)
  const [diagnosticPeer, setDiagnosticPeer] = useState<RTCPeerConnection | null>(null)
  const [signaling, setSignaling] = useState<DisplaySignalHealth>("online")
  const [token, setToken] = useState<string | null>(null)
  const [linkReady, setLinkReady] = useState(false)
  const [phase, setPhase] = useState<"ready" | "connecting" | "live" | "ended">("ready")
  const [error, setError] = useState("")
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    let sessionClosedOnExit = false
    function readLink() {
      const current = active.current
      active.current = null
      if (current) disposeCamera(current, current.published)
      if (videoRef.current) videoRef.current.srcObject = null
      const fragment = window.location.hash.slice(1)
      setToken(TOKEN_PATTERN.test(fragment) ? fragment : null)
      setLinkReady(true)
      setPreview(false)
      setPhase("ready")
      setDiagnosticPeer(null)
      setError("")
    }
    function stopOnExit() {
      const current = active.current
      active.current = null
      if (current) {
        sessionClosedOnExit = current.published
        disposeCamera(current, current.published)
      }
    }
    function restoreAfterExit(event: PageTransitionEvent) {
      if (!event.persisted) return
      if (videoRef.current) videoRef.current.srcObject = null
      const closed = sessionClosedOnExit
      sessionClosedOnExit = false
      setPreview(false)
      setDiagnosticPeer(null)
      setPhase(previous => closed ? "ended" : previous === "connecting" ? "ready" : previous)
    }
    readLink()
    window.addEventListener("hashchange", readLink)
    window.addEventListener("pagehide", stopOnExit)
    window.addEventListener("pageshow", restoreAfterExit)
    return () => {
      window.removeEventListener("hashchange", readLink)
      window.removeEventListener("pagehide", stopOnExit)
      window.removeEventListener("pageshow", restoreAfterExit)
      stopOnExit()
    }
  }, [])

  function finish(session: CameraSession, close: boolean) {
    if (active.current !== session) return
    active.current = null
    disposeCamera(session, close)
    if (videoRef.current) videoRef.current.srcObject = null
    setPreview(false)
    setPhase(close ? "ended" : "ready")
    setDiagnosticPeer(null)
  }

  async function startCamera() {
    if (!token || active.current) return
    setError("")
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Откройте QR-ссылку по HTTPS и проверьте доверие к сертификату на телефоне.")
      return
    }
    if (typeof RTCPeerConnection === "undefined") {
      setError("Этот браузер не поддерживает видеосвязь. Откройте ссылку в Safari или Chrome.")
      return
    }
    const session: CameraSession = { token, abort: new AbortController(), published: false }
    active.current = session
    const signal = session.abort.signal
    setPhase("connecting")
    setSignaling("online")

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
      if (signal.aborted) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      session.stream = stream
      const track = stream.getVideoTracks()[0]
      if (!track) throw new Error("Камера не передала видео.")
      track.contentHint = "motion"
      track.addEventListener("ended", () => {
        if (active.current !== session) return
        finish(session, session.published)
        setError("Камера отключилась.")
      }, { once: true })
      setPreview(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => {})
      }

      const offerDeadline = Date.now() + PENDING_CONNECTION_MS
      let offer = await readDisplaySignal(token, signal)
      while (!offer && Date.now() < offerDeadline) {
        await waitForDisplayPoll(400, signal)
        offer = await readDisplaySignal(token, signal)
      }
      if (offer?.type !== "offer") throw new Error("Дисплей не готов. Откройте QR-код в Brick Studio заново.")
      signal.throwIfAborted()

      const peer = new RTCPeerConnection({ iceServers: [] })
      session.peer = peer
      setDiagnosticPeer(peer)
      peer.addEventListener("connectionstatechange", () => {
        if (peer.connectionState === "failed" && active.current === session) {
          finish(session, session.published)
          setError("Связь с дисплеем прервалась. Проверьте Wi‑Fi.")
        }
      })
      await peer.setRemoteDescription(offer)
      const sender = peer.addTrack(track, stream)
      await peer.setLocalDescription(await peer.createAnswer())
      const parameters = sender.getParameters()
      if (parameters.encodings?.[0]) {
        parameters.degradationPreference = "maintain-framerate"
        parameters.encodings[0].maxFramerate = 32
        await sender.setParameters(parameters).catch(() => {
          // The camera constraints still apply when the browser rejects an encoder hint.
        })
      }
      const answer = await waitForDisplayIce(peer, signal)
      signal.throwIfAborted()
      // Wait for ownership even when the user cancels while publishing.
      await publishDisplaySignal(token, answer)
      session.published = true
      if (signal.aborted) {
        void closeDisplaySignal(token)
        return
      }

      let deadline = Date.now() + PENDING_CONNECTION_MS
      while (!signal.aborted) {
        const state = peer.connectionState
        const connected = state === "connected"
          || peer.iceConnectionState === "connected"
          || peer.iceConnectionState === "completed"
        const failed = state === "failed" || state === "closed"
          || peer.iceConnectionState === "failed" || peer.iceConnectionState === "closed"
        if (failed || (!connected && Date.now() > deadline)) {
          throw new Error("Связь с дисплеем прервалась. Проверьте Wi-Fi и откройте новый QR-код.")
        }
        if (connected) {
          deadline = Date.now() + LOST_CONNECTION_MS
          setPhase("live")
        } else {
          setPhase("connecting")
        }
        await waitForDisplayPoll(3000, signal)
        const health = await pollActiveDisplaySignal(token, signal)
        if (!signal.aborted) setSignaling(health)
      }
    } catch (cause) {
      if (active.current !== session) return
      finish(session, session.published)
      setError(errorText(cause))
    }
  }

  const busy = phase === "connecting" || phase === "live"
  return (
    <main className="mx-auto grid w-full max-w-md gap-4 px-5 py-10">
      <h1 className="text-2xl font-black tracking-tight">Камера для дисплея</h1>
      {linkReady && !token ? (
        <p role="alert" className="text-sm text-slate-700">Откройте QR-код из блока «Дисплей» в Brick Studio.</p>
      ) : null}
      {token ? (
        <>
          <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-slate-950 text-slate-300">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label="Предпросмотр камеры"
              className="absolute inset-0 size-full object-contain"
            />
            {!preview ? <Video size={32} aria-hidden="true" className="relative" /> : null}
            <DisplayDiagnostics peer={diagnosticPeer} videoRef={videoRef} track={active.current?.stream?.getVideoTracks()[0]} signaling={signaling} />
          </div>
          <p role="status" className="text-sm text-slate-700">
            {phase === "live" ? "Камера транслируется в Brick Studio."
              : phase === "connecting" ? "Подключаем камеру…"
              : phase === "ended" ? "Для повторного подключения отсканируйте новый QR-код."
              : "Подключите телефон к той же сети Wi-Fi, что и Brick Studio."}
          </p>
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
          {phase !== "ended" ? (
            <button
              type="button"
              className={`min-h-12 rounded-xl px-4 font-bold text-white ${busy ? "bg-red-700" : "bg-[#087992]"}`}
              onClick={busy ? () => { if (active.current) finish(active.current, active.current.published) } : () => void startCamera()}
            >
              {busy ? "Остановить" : "Включить камеру"}
            </button>
          ) : null}
        </>
      ) : null}
    </main>
  )
}
