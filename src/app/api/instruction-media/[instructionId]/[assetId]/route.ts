import { NextResponse } from "next/server"
import { serverClient, errorResponse, InstructionError } from "@/lib/instructions/access"
import { instructionBucket } from "@/lib/instructions/validation"

export async function GET(_request: Request, context: { params: Promise<{ instructionId: string; assetId: string }> }) {
  try {
    const { instructionId, assetId } = await context.params
    const client = await serverClient()
    const { data: coverKey, error: coverError } = await client.rpc("catalog_cover_object", { p_instruction_id: instructionId, p_asset_id: assetId })
    if (coverError) throw new InstructionError(503, "media_unavailable", "Файл временно недоступен.")
    let objectKey = coverKey as string | null
    let mimeType = "image/jpeg"
    if (!objectKey) {
      const { data: role } = await client.rpc("is_instruction_admin")
      if (role === true) {
        const { data: asset } = await client.from("instruction_assets")
          .select("object_key,mime_type,instruction_id").eq("id", assetId).eq("instruction_id", instructionId).maybeSingle()
        objectKey = asset?.object_key || null
        mimeType = asset?.mime_type || mimeType
      }
    }
    if (!objectKey) throw new InstructionError(404, "not_found", "Файл не найден.")
    const { data: blob, error } = await client.storage.from(instructionBucket).download(objectKey)
    if (error || !blob) throw new InstructionError(503, "media_unavailable", "Файл временно недоступен.")
    return new NextResponse(await blob.arrayBuffer(), { headers: { "Content-Type": blob.type || mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) { return errorResponse(error) }
}
