import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export class InstructionError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export function errorResponse(error: unknown) {
  const known = error instanceof InstructionError ? error : new InstructionError(500, "internal_error", "Не удалось выполнить действие.")
  return NextResponse.json({ error: { code: known.code, message: known.message } }, { status: known.status })
}

export async function serverClient() {
  return createClient(await cookies())
}

export async function verifiedUser() {
  const client = await serverClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new InstructionError(401, "unauthenticated", "Войдите в TLC.")
  return { client, user: data.user }
}

export async function requireAdmin() {
  const { client, user } = await verifiedUser()
  const { data, error } = await client.rpc("is_instruction_admin")
  if (error || data !== true) throw new InstructionError(403, "forbidden", "Нужен доступ администратора.")
  return { client, user }
}

export async function requireCurrentDevice(sessionId: string, generation: number) {
  const { client, user } = await verifiedUser()
  const { data, error } = await client.rpc("is_current_student_device", { p_session_id: sessionId, p_generation: generation })
  if (error || data !== true) throw new InstructionError(409, "stale_device", "Этот планшет больше не активен. Войдите снова.")
  return { client, user }
}

export function noStoreHeaders() {
  return { "Cache-Control": "private, no-store" }
}
