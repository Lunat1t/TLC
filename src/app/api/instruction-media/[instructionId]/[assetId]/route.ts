import { NextResponse } from "next/server"
import { serverClient, errorResponse, InstructionError } from "@/lib/instructions/access"
import { instructionBucket } from "@/lib/instructions/validation"

export async function GET(_request: Request, context: { params: Promise<{ instructionId: string; assetId: string }> }) {
  try {
    const { instructionId, assetId } = await context.params
    const client = await serverClient()
    const { data: coverKey, error: coverError } = await client.rpc("catalog_cover_object", { p_instruction_id: instructionId, p_asset_id: assetId })
    if (coverError) throw new InstructionError(503, "media_unavailable", "Файл временно недоступен.")
    const objectKey = coverKey as string | null
    if (!objectKey) throw new InstructionError(404, "not_found", "Файл не найден.")
    const { data: blob, error } = await client.storage.from(instructionBucket).download(objectKey)
    if (error || !blob) throw new InstructionError(503, "media_unavailable", "Файл временно недоступен.")
    return new NextResponse(await blob.arrayBuffer(), { headers: { "Content-Type": blob.type || "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) { return errorResponse(error) }
}
