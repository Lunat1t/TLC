import { NextResponse } from "next/server"
import { isMissingBillingMigrationError, mapBillingErrorCode } from "@/lib/billing/entitlements"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const { client } = await verifiedUser()
    const body = (await request.json().catch(() => null)) as
      | { orgId?: unknown; userId?: unknown }
      | null

    const orgId = typeof body?.orgId === "string" ? body.orgId.trim() : ""
    const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
    if (!UUID_PATTERN.test(orgId) || !UUID_PATTERN.test(userId)) {
      throw new InstructionError(400, "invalid_member", "Некорректные данные участника.")
    }

    const { data, error } = await client.rpc("remove_org_member", {
      p_org_id: orgId,
      p_target_user_id: userId,
    })

    if (error) {
      if (isMissingBillingMigrationError(error)) {
        throw new InstructionError(503, "migration_pending", "Школьная база пока обновляется.")
      }
      const mapped = mapBillingErrorCode(error)
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }

    return NextResponse.json({ removed: data === true }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
