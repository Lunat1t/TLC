import { NextResponse } from "next/server"
import { isMissingBillingMigrationError, mapBillingErrorCode } from "@/lib/billing/entitlements"
import { errorResponse, InstructionError, noStoreHeaders, verifiedUser } from "@/lib/instructions/access"

export async function GET() {
  try {
    const { client } = await verifiedUser()
    const { data, error } = await client.rpc("tlc_school_workspace")
    if (error) {
      if (isMissingBillingMigrationError(error)) {
        throw new InstructionError(503, "migration_pending", "Школьная база пока обновляется.")
      }
      const mapped = mapBillingErrorCode(error)
      throw new InstructionError(mapped.status, mapped.code, mapped.message)
    }
    return NextResponse.json(data, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
