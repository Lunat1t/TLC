import { NextResponse } from "next/server"
import { isMissingBillingMigrationError, mapBillingErrorCode } from "@/lib/billing/entitlements"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  _request: Request,
  context: { params: Promise<{ inviteId: string }> }
) {
  try {
    const { inviteId } = await context.params
    if (!UUID_PATTERN.test(inviteId)) {
      throw new InstructionError(400, "invalid_invite", "Некорректный код приглашения.")
    }

    const { client } = await verifiedUser()
    const { data, error } = await client.rpc("revoke_org_invite", {
      p_invite_id: inviteId,
    })

    if (error) {
      if (isMissingBillingMigrationError(error)) {
        throw new InstructionError(503, "migration_pending", "Школьная база пока обновляется.")
      }
      const mapped = mapBillingErrorCode(error)
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }

    return NextResponse.json({ revoked: data === true }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
