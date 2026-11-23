import { NextResponse } from "next/server"
import { isMissingBillingMigrationError, mapBillingErrorCode } from "@/lib/billing/entitlements"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

export async function POST(request: Request) {
  try {
    const { client } = await verifiedUser()
    const body = (await request.json().catch(() => null)) as { code?: unknown } | null
    const rawCode = typeof body?.code === "string" ? body.code.trim() : ""
    const normalized = rawCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    if (normalized.length < 8 || normalized.length > 32) {
      throw new InstructionError(400, "invite_invalid", "Введите корректный код школы (от 8 символов).")
    }

    const { data, error } = await client.rpc("redeem_org_invite", { p_code: normalized })
    if (error) {
      if (isMissingBillingMigrationError(error)) {
        throw new InstructionError(503, "migration_pending", "Школьная база пока обновляется.")
      }
      const mapped = mapBillingErrorCode(error)
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }

    const row = (data && typeof data === "object" ? data : {}) as {
      ok?: boolean
      error?: string
      attempts_remaining?: number
    }
    if (row.ok === false) {
      const mapped = mapBillingErrorCode(row.error ?? "invite_invalid")
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }

    return NextResponse.json(data, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE() {
  try {
    const { client } = await verifiedUser()
    const { data, error } = await client.rpc("leave_org")
    if (error) {
      if (isMissingBillingMigrationError(error)) {
        throw new InstructionError(503, "migration_pending", "Школьная база пока обновляется.")
      }
      const mapped = mapBillingErrorCode(error)
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }
    return NextResponse.json({ left: data === true }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
