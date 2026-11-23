import { mapKits } from "../map-kits.ts"
import { isMissingRoadmapMigrationError } from "../roadmap.ts"
import { rankNames } from "../student-level.ts"

export type InstructionGateResult =
  | { allowed: true; migrationPending?: boolean }
  | {
      allowed: false
      status: 401 | 403 | 404
      code: "unauthenticated" | "rank_locked" | "subscription_required" | "forbidden" | "not_found"
      message: string
      requiredRank: number
      requiredRankLabel: string
      requiredKit: string | null
      requiredKitLabel: string | null
      currentRank: number
    }

export interface GateSupabaseClient {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null }
      error: { status?: number } | null
    }>
  }
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { role?: unknown; onboarding_complete?: unknown } | null
          error: { code?: string; message?: string } | null
        }>
      }
    }
  }
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    data: unknown
    error: { code?: string; message?: string; details?: string; hint?: string } | null
  }>
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function defaultErrorFactory(status: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { status, code })
}

function unauthenticatedResult(): InstructionGateResult {
  return {
    allowed: false,
    status: 401,
    code: "unauthenticated",
    message: "Войдите в Brick Studio, чтобы открыть эту инструкцию.",
    requiredRank: 0,
    requiredRankLabel: rankNames[0],
    requiredKit: null,
    requiredKitLabel: null,
    currentRank: 0,
  }
}

function forbiddenResult(): InstructionGateResult {
  return {
    allowed: false,
    status: 403,
    code: "forbidden",
    message: "Доступ к инструкциям открыт только ученикам и учителям Brick Studio.",
    requiredRank: 0,
    requiredRankLabel: rankNames[0],
    requiredKit: null,
    requiredKitLabel: null,
    currentRank: 0,
  }
}

export function parseInstructionAccessPayload(data: unknown): InstructionGateResult {
  const row = (data && typeof data === "object" ? data : {}) as {
    exists?: boolean
    allowed?: boolean
    reason?: string
    required_rank?: number
    required_kit?: string
    current_rank?: number
  }

  if (row.exists === false || row.reason === "not_found") {
    return {
      allowed: false,
      status: 404,
      code: "not_found",
      message: "Инструкция не найдена.",
      requiredRank: 0,
      requiredRankLabel: rankNames[0],
      requiredKit: null,
      requiredKitLabel: null,
      currentRank: 0,
    }
  }

  if (row.allowed === true) {
    return { allowed: true }
  }

  const requiredRank =
    typeof row.required_rank === "number" && Number.isInteger(row.required_rank)
      ? Math.max(0, Math.min(rankNames.length - 1, row.required_rank))
      : 0
  const requiredRankLabel = rankNames[requiredRank] ?? rankNames[0]
  const requiredKit = typeof row.required_kit === "string" ? row.required_kit : null
  const requiredKitLabel =
    mapKits.find((item) => item.id === requiredKit)?.label ?? requiredKit
  const currentRank =
    typeof row.current_rank === "number" && Number.isInteger(row.current_rank)
      ? Math.max(0, Math.min(rankNames.length - 1, row.current_rank))
      : 0

  if (row.reason === "unauthenticated") {
    return {
      allowed: false,
      status: 401,
      code: "unauthenticated",
      message:
        requiredRank > 0
          ? `Войдите в Brick Studio: для этой инструкции нужен ранг ${requiredRankLabel}.`
          : "Войдите в Brick Studio, чтобы открыть эту инструкцию.",
      requiredRank,
      requiredRankLabel,
      requiredKit,
      requiredKitLabel,
      currentRank: 0,
    }
  }

  if (row.reason === "subscription_required") {
    return {
      allowed: false,
      status: 403,
      code: "subscription_required",
      message: "Для доступа к инструкциям нужна активная подписка или код школы.",
      requiredRank,
      requiredRankLabel,
      requiredKit,
      requiredKitLabel,
      currentRank,
    }
  }

  if (row.reason === "rank_locked") {
    const kitText = requiredKitLabel ? ` по набору ${requiredKitLabel}` : ""
    return {
      allowed: false,
      status: 403,
      code: "rank_locked",
      message: `Инструкция закрыта: нужен ранг ${requiredRankLabel}${kitText}.`,
      requiredRank,
      requiredRankLabel,
      requiredKit,
      requiredKitLabel,
      currentRank,
    }
  }

  return {
    allowed: false,
    status: 403,
    code: "forbidden",
    message: "Нет доступа к этой инструкции.",
    requiredRank,
    requiredRankLabel,
    requiredKit,
    requiredKitLabel,
    currentRank,
  }
}

export async function checkInstructionGateWithClient(
  client: GateSupabaseClient,
  slug: string,
  createError: (status: number, code: string, message: string) => Error = defaultErrorFactory,
): Promise<InstructionGateResult> {
  if (!SLUG_PATTERN.test(slug)) {
    throw createError(404, "not_found", "Инструкция не найдена.")
  }

  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) {
    if (typeof authError.status === "number" && authError.status >= 400 && authError.status < 500) {
      return unauthenticatedResult()
    }
    throw createError(503, "dependency_unavailable", "Проверка входа временно недоступна.")
  }
  if (!authData.user) {
    return unauthenticatedResult()
  }

  const [profileRes, publishRes] = await Promise.all([
    client
      .from("profiles")
      .select("role,onboarding_complete")
      .eq("id", authData.user.id)
      .maybeSingle(),
    client.rpc("can_publish_instruction"),
  ])

  const isPublisher = !publishRes.error && publishRes.data === true
  if (!isPublisher) {
    if (profileRes.error) {
      throw createError(503, "catalog_unavailable", "Не удалось проверить доступ к инструкции.")
    }
    const isOnboardedStudent =
      profileRes.data?.onboarding_complete === true && profileRes.data?.role === "student"
    if (publishRes.error && !isOnboardedStudent) {
      throw createError(503, "catalog_unavailable", "Не удалось проверить права доступа.")
    }
    if (!isOnboardedStudent) {
      return forbiddenResult()
    }
  }

  const { data, error } = await client.rpc("tlc_instruction_access", { p_slug: slug })
  if (error) {
    if (isMissingRoadmapMigrationError(error)) {
      return { allowed: true, migrationPending: true }
    }
    throw createError(503, "catalog_unavailable", "Не удалось проверить доступ к инструкции.")
  }
  return parseInstructionAccessPayload(data)
}

export async function requireInstructionGateWithClient(
  client: GateSupabaseClient,
  slug: string,
  createError: (status: number, code: string, message: string) => Error = defaultErrorFactory,
): Promise<void> {
  const result = await checkInstructionGateWithClient(client, slug, createError)
  if (!result.allowed) {
    throw createError(result.status, result.code, result.message)
  }
}
