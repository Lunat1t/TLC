import { NextResponse } from "next/server"
import { isMissingBillingMigrationError, mapBillingErrorCode } from "@/lib/billing/entitlements"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const { client } = await verifiedUser()
    const body = (await request.json().catch(() => null)) as
      | { cardId?: unknown; answer?: unknown }
      | null

    const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : ""
    const answer = typeof body?.answer === "string" ? body.answer.trim() : ""
    if (!UUID_PATTERN.test(cardId)) {
      throw new InstructionError(400, "invalid_card", "Некорректная карточка роадмапа.")
    }
    if (!answer) {
      throw new InstructionError(400, "invalid_answer", "Выберите или введите ответ для проверки.")
    }

    const { data, error } = await client.rpc("complete_solo_card", {
      p_card_id: cardId,
      p_answer: answer,
    })

    if (error) {
      if (isMissingBillingMigrationError(error)) {
        throw new InstructionError(503, "migration_pending", "Функция самопроверки пока недоступна.")
      }
      const mapped = mapBillingErrorCode(error)
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }

    const row = (data && typeof data === "object" ? data : {}) as {
      ok?: boolean
      error?: string
      kit?: string
      unlocked_rank?: number
      attempts_remaining?: number
    }
    if (row.ok === false) {
      const mapped = mapBillingErrorCode(row.error ?? "wrong_answer")
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }

    return NextResponse.json(
      {
        ok: true,
        kit: row.kit ?? null,
        unlockedRank: typeof row.unlocked_rank === "number" ? row.unlocked_rank : null,
      },
      { headers: noStoreHeaders() }
    )
  } catch (error) {
    return errorResponse(error)
  }
}
