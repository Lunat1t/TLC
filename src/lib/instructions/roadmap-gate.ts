import { mapKits } from "@/lib/map-kits"
import { isMissingRoadmapMigrationError } from "@/lib/roadmap"
import { rankNames } from "@/lib/student-level"
import { InstructionError, serverClient } from "./access"

export type InstructionGateResult =
  | { allowed: true; migrationPending?: boolean }
  | {
      allowed: false
      status: 401 | 403 | 404
      code: "unauthenticated" | "rank_locked" | "forbidden" | "not_found"
      message: string
      requiredRank: number
      requiredRankLabel: string
      requiredKit: string | null
      requiredKitLabel: string | null
      currentRank: number
    }

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
      message: `Войдите в Brick Studio: для этой инструкции нужен ранг ${requiredRankLabel}.`,
      requiredRank,
      requiredRankLabel,
      requiredKit,
      requiredKitLabel,
      currentRank: 0,
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

export async function checkInstructionGate(slug: string): Promise<InstructionGateResult> {
  if (!SLUG_PATTERN.test(slug)) {
    throw new InstructionError(404, "not_found", "Инструкция не найдена.")
  }
  const client = await serverClient()
  const { data, error } = await client.rpc("tlc_instruction_access", { p_slug: slug })
  if (error) {
    if (isMissingRoadmapMigrationError(error)) {
      return { allowed: true, migrationPending: true }
    }
    throw new InstructionError(503, "catalog_unavailable", "Не удалось проверить доступ к инструкции.")
  }
  return parseInstructionAccessPayload(data)
}

export async function requireInstructionGate(slug: string): Promise<void> {
  const result = await checkInstructionGate(slug)
  if (!result.allowed) {
    throw new InstructionError(result.status, result.code, result.message)
  }
}
