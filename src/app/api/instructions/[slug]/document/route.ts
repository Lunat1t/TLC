import { NextResponse } from "next/server"
import { errorResponse, InstructionError, serverClient } from "@/lib/instructions/access"
import { publicDriveDownloadUrl, MAX_PDF_BYTES } from "@/lib/instructions/google-drive"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new InstructionError(404, "not_found", "Инструкция не найдена.")
    }
    const client = await serverClient()
    const { data: fileId, error } = await client.rpc("published_instruction_drive_file", { p_slug: slug })
    if (error || typeof fileId !== "string") throw new InstructionError(404, "not_found", "PDF не найден.")

    const response = await fetch(await publicDriveDownloadUrl(fileId), {
      cache: "no-store", signal: AbortSignal.timeout(45_000),
    })
    if (!response.ok || !response.body) throw new InstructionError(503, "pdf_unavailable", "Не удалось загрузить PDF.")
    const contentLength = response.headers.get("content-length")
    const declaredSize = contentLength === null ? null : Number(contentLength)
    if (declaredSize !== null && (!Number.isSafeInteger(declaredSize) || declaredSize > MAX_PDF_BYTES)) {
      await response.body.cancel()
      throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
    }

    const reader = response.body.getReader()
    const prefixChunks: Uint8Array[] = []
    let received = 0
    try {
      while (received < 5) {
        const { done, value } = await reader.read()
        if (done || !value?.byteLength) throw new Error("truncated_pdf")
        prefixChunks.push(value)
        received += value.byteLength
      }
      const prefix = Buffer.concat(prefixChunks, received)
      if (prefix.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("invalid_pdf")
      if (received > MAX_PDF_BYTES) throw new Error("large_pdf")
      let firstChunk: Uint8Array | null = new Uint8Array(prefix)
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (firstChunk) {
            controller.enqueue(firstChunk)
            firstChunk = null
            return
          }
          try {
            const { done, value } = await reader.read()
            if (done) { controller.close(); return }
            received += value.byteLength
            if (received > MAX_PDF_BYTES) throw new Error("large_pdf")
            controller.enqueue(value)
          } catch (cause) {
            controller.error(cause)
            void reader.cancel(cause).catch(() => {})
          }
        },
        cancel(reason) { void reader.cancel(reason).catch(() => {}) },
      })
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      })
    } catch {
      await reader.cancel().catch(() => {})
      throw new InstructionError(503, "pdf_unavailable", "Google Drive не отдал корректный PDF.")
    }
  } catch (error) { return errorResponse(error) }
}
