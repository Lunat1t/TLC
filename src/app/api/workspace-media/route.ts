import { NextResponse } from "next/server"
import { verifiedUser, errorResponse } from "@/lib/instructions/access"
import { assertWorkspaceMediaOrigin, parseWorkspaceMediaRequest, uploadWorkspaceImage } from "@/lib/workspace-media-server"

export async function POST(request: Request) {
  try {
    assertWorkspaceMediaOrigin(request)
    const { client, user } = await verifiedUser()
    const body = await parseWorkspaceMediaRequest(request, user.id, 2_800_000)
    const url = await uploadWorkspaceImage(client, user.id, body.dataUrl)
    return NextResponse.json({ userId: user.id, url }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}
