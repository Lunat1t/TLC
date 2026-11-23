import { NextResponse } from "next/server"
import { listCatalog } from "@/lib/instructions/catalog"
import { errorResponse, noStoreHeaders, requireLearningAccess } from "@/lib/instructions/access"

export async function GET(request: Request) {
  try {
    await requireLearningAccess()
    const url = new URL(request.url)
    const result = await listCatalog({
      kit: url.searchParams.get("kit"),
      q: url.searchParams.get("q"),
      cursor: url.searchParams.get("cursor"),
    })
    return NextResponse.json(result, { headers: noStoreHeaders() })
  } catch (error) {
    return errorResponse(error)
  }
}
