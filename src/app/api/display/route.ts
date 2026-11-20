import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export const runtime = "nodejs"

const TOKEN = /^[a-f0-9]{64}$/
const ROOM_LIMIT = 128
const ROOM_IDLE_MS = 20 * 60 * 1000
const MAX_SDP_LENGTH = 32 * 1024
const MAX_BODY_BYTES = 128 * 1024

type Role = "offer" | "answer"
type Description = { type: Role; sdp: string }
type Room = {
  tokens: Record<Role, string>
  descriptions: Partial<Record<Role, Description>>
  expiresAt: number
}
type Member = { role: Role; room: Room }

const localServer = globalThis as typeof globalThis & {
  brickStudioDisplayMembers?: Map<string, Member>
}

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") return false

  const origin = request.headers.get("origin")
  if (!origin) return true
  const url = new URL(request.url)
  const host = request.headers.get("host") || url.host
  return origin === `${url.protocol}//${host}`
}

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) return null

  const decoder = new TextDecoder("utf-8", { fatal: true })
  let text = ""
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {})
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

function removeRoom(members: Map<string, Member>, room: Room) {
  members.delete(room.tokens.offer)
  members.delete(room.tokens.answer)
}

async function signalViaDatabase(body: Record<string, unknown>) {
  if (typeof body.action !== "string") return json({ error: "Неверный запрос." }, 400)

  const supabase = createClient(await cookies())
  const { data, error } = await supabase.rpc("display_signal", {
    p_action: body.action,
    p_token: typeof body.token === "string" ? body.token : null,
    p_description: body.description ?? null,
  })

  if (error || !isObject(data) || typeof data.status !== "number" || !isObject(data.body)) {
    console.error("Display signaling RPC failed", error?.code ?? "invalid-response")
    return json({ error: "Сервер трансляции недоступен." }, 503)
  }

  return json(data.body, data.status)
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Другой источник запроса." }, 403)

  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
  if (contentType !== "application/json") return json({ error: "Ожидается JSON." }, 415)
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return json({ error: "Слишком большой запрос." }, 413)
  }

  const body = await readBody(request)
  if (!isObject(body)) return json({ error: "Неверный запрос." }, 400)
  if (process.env.NODE_ENV === "production") return signalViaDatabase(body)

  const members = localServer.brickStudioDisplayMembers ??= new Map()
  const now = Date.now()
  for (const { room } of members.values()) {
    if (room.expiresAt <= now) removeRoom(members, room)
  }

  if (body.action === "create") {
    if (members.size >= ROOM_LIMIT * 2) return json({ error: "Слишком много сессий дисплея." }, 429)

    const offer = randomBytes(32).toString("hex")
    const answer = randomBytes(32).toString("hex")
    const room: Room = { tokens: { offer, answer }, descriptions: {}, expiresAt: now + ROOM_IDLE_MS }
    members.set(offer, { role: "offer", room })
    members.set(answer, { role: "answer", room })
    return json({ offerToken: offer, answerToken: answer })
  }

  if (typeof body.token !== "string" || !TOKEN.test(body.token)) {
    return json({ error: "Неверный код подключения." }, 400)
  }
  const member = members.get(body.token)
  if (!member) return json({ error: "Сессия дисплея закрыта." }, 404)
  const { role, room } = member

  if (body.action === "close") {
    removeRoom(members, room)
    return json({ ok: true })
  }

  if (body.action === "read") {
    room.expiresAt = now + ROOM_IDLE_MS
    const counterpart = role === "offer" ? "answer" : "offer"
    return json({ description: room.descriptions[counterpart] ?? null })
  }

  if (body.action === "publish") {
    const { description } = body
    if (!isObject(description) || description.type !== role || typeof description.sdp !== "string"
      || !description.sdp.trim() || description.sdp.length > MAX_SDP_LENGTH) {
      return json({ error: "Неверные параметры видеосвязи." }, 400)
    }
    if (role === "answer" && !room.descriptions.offer) {
      return json({ error: "Дисплей ещё не готов." }, 409)
    }
    const existing = room.descriptions[role]
    if (existing && existing.sdp !== description.sdp) {
      return json({ error: "Код подключения уже использован." }, 409)
    }
    room.descriptions[role] = { type: role, sdp: description.sdp }
    room.expiresAt = now + ROOM_IDLE_MS
    return json({ ok: true })
  }

  return json({ error: "Неизвестное действие." }, 400)
}
