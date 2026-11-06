import { NextResponse } from "next/server"
import { listCatalog } from "@/lib/instructions/catalog"
import { errorResponse } from "@/lib/instructions/access"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const result = await listCatalog({ kit: url.searchParams.get("kit"), q: url.searchParams.get("q"), cursor: url.searchParams.get("cursor") })
    return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } })
  } catch (error) { return errorResponse(error) }
}
