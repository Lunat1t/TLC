import { NextResponse } from "next/server"
import { isMissingBillingMigrationError, mapBillingErrorCode } from "@/lib/billing/entitlements"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  try {
    const { client } = await verifiedUser()
    const body = (await request.json().catch(() => null)) as
      | { orgId?: unknown; name?: unknown; teacherId?: unknown }
      | null
    const orgId = typeof body?.orgId === "string" ? body.orgId.trim() : ""
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const teacherId =
      typeof body?.teacherId === "string" && UUID_PATTERN.test(body.teacherId.trim())
        ? body.teacherId.trim()
        : null

    if (!UUID_PATTERN.test(orgId) || !name || name.length > 80) {
      throw new InstructionError(400, "invalid_group", "Укажите название группы (до 80 символов).")
    }

    const { data, error } = await client.rpc("create_org_group", {
      p_org_id: orgId,
      p_name: name,
      p_teacher_id: teacherId,
    })

    if (error) {
      if (isMissingBillingMigrationError(error)) {
        throw new InstructionError(503, "migration_pending", "Школьная база пока обновляется.")
      }
      const mapped = mapBillingErrorCode(error)
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }

    return NextResponse.json({ groupId: data }, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
