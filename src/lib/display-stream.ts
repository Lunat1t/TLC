export type DisplayDescription = { type: "offer" | "answer"; sdp: string }

class DisplaySignalError extends Error {
  readonly status: number
  constructor(status: number) {
    const messages: Record<number, string> = {
      401: "Войдите в Brick Studio, чтобы получить QR-код.",
      404: "Подключение закрыто. Получите новый QR-код в редакторе.",
      409: "К этому дисплею уже подключается другой телефон.",
      429: "Слишком много подключений. Закройте лишние дисплеи и повторите.",
    }
    super(messages[status] ?? "Сервер трансляции недоступен. Проверьте подключение к Wi‑Fi.")
    this.status = status
  }
}

async function sendDisplaySignal<T>(data: object, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  const request = new AbortController()
  const forwardAbort = () => request.abort(signal?.reason)
  signal?.addEventListener("abort", forwardAbort, { once: true })
  const timer = setTimeout(() => request.abort(new Error("Сервер трансляции не ответил. Проверьте Wi‑Fi.")), 6000)
  try {
    const response = await fetch("/api/display", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: request.signal,
    })
    if (!response.ok) throw new DisplaySignalError(response.status)
    return await response.json() as T
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", forwardAbort)
  }
}

export function createDisplaySignal(signal: AbortSignal) {
  return sendDisplaySignal<{ offerToken: string; answerToken: string }>({ action: "create" }, signal)
}

export async function readDisplaySignal(token: string, signal?: AbortSignal) {
  const { description } = await sendDisplaySignal<{ description: DisplayDescription | null }>({ action: "read", token }, signal)
  return description
}

export async function publishDisplaySignal(token: string, description: DisplayDescription, signal?: AbortSignal) {
  await sendDisplaySignal({ action: "publish", token, description }, signal)
}

export async function closeDisplaySignal(token: string) {
  try {
    await fetch("/api/display", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close", token }),
    })
  } catch {
    // The signaling service expires leases if a client loses its network connection.
  }
}

export function waitForDisplayIce(peer: RTCPeerConnection, signal: AbortSignal): Promise<DisplayDescription> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("Не удалось подготовить прямое видеосоединение.")), 8000)
    function finish(error?: unknown) {
      clearTimeout(timeout)
      peer.removeEventListener("icegatheringstatechange", ready)
      signal.removeEventListener("abort", abort)
      if (error) {
        reject(error)
        return
      }
      const description = peer.localDescription
      if (!description?.sdp || (description.type !== "offer" && description.type !== "answer")) {
        reject(new Error("Браузер не подготовил видеосоединение."))
        return
      }
      resolve({ type: description.type, sdp: description.sdp })
    }
    function abort() { finish(signal.reason) }
    function ready() {
      if (peer.iceGatheringState === "complete") finish()
    }
    peer.addEventListener("icegatheringstatechange", ready)
    signal.addEventListener("abort", abort, { once: true })
    ready()
  })
}

export function waitForDisplayPoll(ms: number, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, ms)
    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

export type DisplaySignalHealth = "online" | "retrying" | "expired"

/** Only after SDP exchange: signaling availability is independent of media health.
 * Keep retrying to renew leases, but an expired lease must not close a live peer.
 * Before SDP exchange callers still use strict readDisplaySignal.
 */
export async function pollActiveDisplaySignal(token: string, signal: AbortSignal): Promise<DisplaySignalHealth> {
  try {
    await readDisplaySignal(token, signal)
    signal.throwIfAborted()
    return "online"
  } catch (error) {
    signal.throwIfAborted()
    return error instanceof DisplaySignalError && [401, 403, 404, 410].includes(error.status) ? "expired" : "retrying"
  }
}
