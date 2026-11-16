import { NextResponse } from "next/server"
import { requireAdmin, errorResponse, InstructionError } from "@/lib/instructions/access"
import { ensurePublicDriveRead, listConfiguredPdfs, configuredPdf, verifyPdfSignature, MAX_PDF_BYTES } from "@/lib/instructions/google-drive"

export const runtime = "nodejs"

export async function GET() {
  try {
    const { client } = await requireAdmin()
    const [listing, draftsResult] = await Promise.all([
      listConfiguredPdfs(),
      client.from("instructions").select("id,title,slug,kit").eq("status", "draft").order("updated_at", { ascending: false }),
    ])
    if (draftsResult.error) throw new InstructionError(503, "drafts_unavailable", "Не удалось загрузить черновики Brick Studio.")
    const sourceIds = listing.files.map((file) => file.id)
    const imported = sourceIds.length
      ? await client.from("instruction_assets").select("source_file_id,instruction_id").eq("source_provider", "google_drive").in("source_file_id", sourceIds)
      : { data: [], error: null }
    if (imported.error) throw new InstructionError(503, "assets_unavailable", "Не удалось проверить импортированные PDF.")
    const importedById = new Map((imported.data || []).map((row) => [row.source_file_id, row.instruction_id]))
    return NextResponse.json({
      files: listing.files.map(({ id, name, size, modifiedTime }) => ({ id, name, size: Number(size || 0), modifiedTime, tooLarge: Number(size || 0) > MAX_PDF_BYTES, importedTo: importedById.get(id) || null })),
      drafts: draftsResult.data || [],
      limits: { maxDepth: 4, maxPdfs: 500, truncatedByDepth: listing.truncatedByDepth, truncatedByCount: listing.truncatedByCount },
    }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const { client } = await requireAdmin()
    const body = await request.json() as Record<string, unknown>
    if (body.action === "create") {
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : ""
      const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : ""
      const kit = body.kit
      if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !["spike", "ev3"].includes(String(kit))) {
        throw new InstructionError(400, "invalid_instruction", "Укажите название, URL-имя латиницей и модель набора.")
      }
      const { data, error } = await client.from("instructions").insert({ title, slug, kit, status: "draft", summary: "" }).select("id,title,slug,kit").single()
      if (error) throw new InstructionError(error.code === "23505" ? 409 : 503, error.code === "23505" ? "slug_exists" : "create_failed", error.code === "23505" ? "Такое URL-имя уже занято." : "Не удалось создать черновик.")
      return NextResponse.json({ draft: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } })
    }

    const instructionId = typeof body.instructionId === "string" ? body.instructionId : ""
    const fileId = typeof body.fileId === "string" ? body.fileId : ""
    if (!/^[0-9a-f-]{36}$/i.test(instructionId) || !/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) {
      throw new InstructionError(400, "invalid_import", "Выберите черновик и PDF из папки Drive.")
    }
    const { data: draft, error: draftError } = await client.from("instructions").select("id,status").eq("id", instructionId).maybeSingle()
    if (draftError || !draft) throw new InstructionError(404, "draft_not_found", "Черновик не найден.")
    if (draft.status !== "draft") throw new InstructionError(409, "not_a_draft", "PDF можно импортировать только в черновик.")
    const file = await configuredPdf(fileId)
    await verifyPdfSignature(file)
    const { data: duplicate } = await client.from("instruction_assets").select("instruction_id").eq("source_provider", "google_drive").eq("source_file_id", file.id).maybeSingle()
    if (duplicate) throw new InstructionError(409, "already_imported", "Этот PDF уже импортирован в Brick Studio.")

    await ensurePublicDriveRead(file.id)

    const { data: asset, error: insertError } = await client.from("instruction_assets").insert({
      instruction_id: instructionId,
      kind: "document",
      object_key: null,
      mime_type: "application/pdf",
      byte_size: Number(file.size),
      source_provider: "google_drive",
      source_file_id: file.id,
    }).select("id,instruction_id,byte_size").single()
    if (insertError) {
      throw new InstructionError(503, "asset_record_failed", "Не удалось сохранить ссылку на PDF в каталоге Brick Studio.")
    }
    return NextResponse.json({ asset, sourceName: file.name }, { status: 201, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}
