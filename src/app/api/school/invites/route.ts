import { NextResponse } from "next/server"
import { isMissingBillingMigrationError, mapBillingErrorCode } from "@/lib/billing/entitlements"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const { client } = await verifiedUser()
    const body = (await request.json().catch(() => null)) as
      | {
          orgId?: unknown
          groupId?: unknown
          targetRole?: unknown
          maxUses?: unknown
          ttlMinutes?: unknown
        }
      | null

    const orgId = typeof body?.orgId === "string" ? body.orgId.trim() : ""
    if (!UUID_PATTERN.test(orgId)) {
      throw new InstructionError(400, "invalid_org", "Не указана организация.")
    }

    const groupId =
      typeof body?.groupId === "string" && UUID_PATTERN.test(body.groupId.trim())
        ? body.groupId.trim()
        : null
    const targetRole = body?.targetRole === "teacher" ? "teacher" : "student"
    const maxUses = Math.max(1, Math.min(500, Math.trunc(Number(body?.maxUses ?? 30) || 30)))
    const ttlMinutes = Math.max(5, Math.min(43200, Math.trunc(Number(body?.ttlMinutes ?? 1440) || 1440)))

    const { data, error } = await client.rpc("create_org_invite", {
      p_org_id: orgId,
      p_group_id: groupId,
      p_target_role: targetRole,
      p_max_uses: maxUses,
      p_ttl_minutes: ttlMinutes,
    })

    if (error) {
      if (isMissingBillingMigrationError(error)) {
        throw new InstructionError(503, "migration_pending", "Школьная база пока обновляется.")
      }
      const mapped = mapBillingErrorCode(error)
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }

    return NextResponse.json({ invite: data }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
