import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { requireAdmin, errorResponse, InstructionError } from "@/lib/instructions/access"
import { publicDriveDownloadUrl, MAX_PDF_BYTES } from "@/lib/instructions/google-drive"

export async function POST(request: Request) {
  try {
    const { client } = await requireAdmin()
    const body = await request.json()
    const title = String(body.title || "").trim()
    if (!title || title.length > 120 || !["spike", "ev3"].includes(body.kit) || body.rights !== true) {
      throw new InstructionError(400, "invalid_instruction", "Укажите название, набор и подтвердите право на публикацию.")
    }
    let fileId: string | undefined
    try {
      const url = new URL(String(body.url || ""))
      if (url.protocol === "https:" && url.hostname === "drive.google.com") {
        fileId = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]{10,200})(?:\/|$)/)?.[1] || url.searchParams.get("id") || undefined
      }
    } catch {}
    if (!fileId || !/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) {
      throw new InstructionError(400, "invalid_drive_link", "Вставьте ссылку на PDF в Google Drive.")
    }
    const response = await fetch(await publicDriveDownloadUrl(fileId), {
      headers: { Range: "bytes=0-4" }, cache: "no-store", signal: AbortSignal.timeout(20_000),
    })
    const reader = response.body?.getReader()
    const first = await reader?.read()
    await reader?.cancel()
    const size = Number(response.headers.get("content-range")?.split("/").pop() || response.headers.get("content-length"))
    if (!response.ok || !first?.value || Buffer.from(first.value).subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new InstructionError(400, "pdf_not_public", "PDF недоступен для скачивания. В Google Drive включите «Все, у кого есть ссылка — Читатель».")
    }
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PDF_BYTES) {
      throw new InstructionError(400, "invalid_pdf_size", "Не удалось подтвердить размер PDF (до 100 МБ).")
    }
    const { data, error } = await client.rpc("publish_drive_instruction", {
      p_title: title, p_kit: body.kit, p_slug: `instruction-${randomUUID()}`, p_file_id: fileId, p_size: size,
    })
    if (error) throw new InstructionError(error.code === "23505" ? 409 : 503, "publish_failed", error.code === "23505" ? "Этот PDF уже добавлен." : "Не удалось опубликовать инструкцию.")
    return NextResponse.json({ instruction: data }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
