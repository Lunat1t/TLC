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
  if (error) {
    if (typeof error.status === "number" && error.status >= 400 && error.status < 500) {
      throw new InstructionError(401, "unauthenticated", "Войдите в Brick Studio.")
    }
    throw new InstructionError(503, "dependency_unavailable", "Проверка входа временно недоступна.")
  }
  if (!data.user) throw new InstructionError(401, "unauthenticated", "Войдите в Brick Studio.")
  return { client, user: data.user }
}

export async function requireAdmin() {
  const { client, user } = await verifiedUser()
  const { data, error } = await client.rpc("is_instruction_admin")
  if (error) {
    throw new InstructionError(503, "dependency_unavailable", "Не удалось проверить права доступа. Повторите позже.")
  }
  if (data !== true) throw new InstructionError(403, "forbidden", "Нужен доступ администратора.")
  return { client, user }
}

export async function requireCurrentDevice(sessionId: string, generation: number) {
  const { client, user } = await verifiedUser()
  const { data, error } = await client.rpc("is_current_student_device", { p_session_id: sessionId, p_generation: generation })
  if (error) {
    throw new InstructionError(503, "dependency_unavailable", "Не удалось проверить активный планшет. Повторите позже.")
  }
  if (data !== true) throw new InstructionError(409, "stale_device", "Этот планшет больше не активен. Войдите снова.")
  return { client, user }
}

export function noStoreHeaders() {
  return { "Cache-Control": "private, no-store" }
}

export async function requireInstructionPublisher() {
  const { client, user } = await verifiedUser()
  const { data, error } = await client.rpc("can_publish_instruction")
  if (error) throw new InstructionError(503, "dependency_unavailable", "Не удалось проверить права публикации.")
  if (data !== true) throw new InstructionError(403, "forbidden", "Добавлять инструкции может только учитель.")
  return { client, user }
}

import { isMissingBillingMigrationError, parseEntitlementsPayload } from "@/lib/billing/entitlements"

export async function requireLearningAccess() {
  const { client, user } = await verifiedUser()
  const { data, error } = await client.rpc("get_effective_entitlements")
  if (error) {
    if (isMissingBillingMigrationError(error)) {
      const adminRes = await client.rpc("is_instruction_admin")
      if (!adminRes.error && adminRes.data === true) {
        return { client, user }
      }
      throw new InstructionError(403, "subscription_required", "Нужна активная подписка или код школы.")
    }
    throw new InstructionError(503, "dependency_unavailable", "Не удалось проверить подписку. Повторите позже.")
  }

  const entitlements = parseEntitlementsPayload(data)
  if (!entitlements.canAccessLearning) {
    throw new InstructionError(403, "subscription_required", "Нужна активная подписка или код школы.")
  }
  return { client, user, entitlements }
}
