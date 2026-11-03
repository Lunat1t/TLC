import { NextResponse } from "next/server"
import { listCatalog } from "@/lib/instructions/catalog"
import { errorResponse } from "@/lib/instructions/access"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const result = await listCatalog({ kit: url.searchParams.get("kit"), q: url.searchParams.get("q"), cursor: url.searchParams.get("cursor") })
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return errorResponse(error) }
}
