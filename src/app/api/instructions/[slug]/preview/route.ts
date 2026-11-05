import { NextResponse } from "next/server"
import { serverClient } from "@/lib/instructions/access"
import { MAX_PDF_BYTES, publicDriveDownloadUrl } from "@/lib/instructions/google-drive"
import { MAX_AUTO_PREVIEW_PDF_BYTES, renderFirstPagePreview } from "@/lib/instructions/pdf-preview"

export const runtime = "nodejs"
export const maxDuration = 60

const fallbackCover = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"><rect width="720" height="480" fill="#d5f7fc"/><path d="M360 118 442 200 360 282 278 200z" fill="none" stroke="#0085a0" stroke-width="12"/><path d="M360 148 412 200 360 252 308 200z" fill="#0085a0"/></svg>`

function fallbackResponse(reason: string) {
  console.error("instruction_preview_fallback", reason)
  return new NextResponse(fallbackCover, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  let phase = "params"
  try {
    const { slug } = await context.params
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return fallbackResponse("invalid_slug")

    phase = "catalog_rpc"
    const client = await serverClient()
    const { data: fileId, error } = await client.rpc("published_instruction_drive_file", { p_slug: slug })
    if (error || typeof fileId !== "string") return fallbackResponse(error ? "catalog_rpc_error" : "published_pdf_missing")

    phase = "drive_head"
    const downloadUrl = await publicDriveDownloadUrl(fileId)
    const head = await fetch(downloadUrl, {
      headers: { Range: "bytes=0-4" }, cache: "no-store", signal: AbortSignal.timeout(20_000),
    })
    const reader = head.body?.getReader()
    const signature = await reader?.read()
    await reader?.cancel()
    const size = Number(head.headers.get("content-range")?.split("/").pop() || head.headers.get("content-length"))
    if (!head.ok || !signature?.value || Buffer.from(signature.value).subarray(0, 5).toString("ascii") !== "%PDF-" || !Number.isSafeInteger(size) || size <= 0 || size > MAX_PDF_BYTES) {
      return fallbackResponse("invalid_drive_head")
    }
    if (size > MAX_AUTO_PREVIEW_PDF_BYTES) return fallbackResponse("pdf_over_auto_preview_limit")

    phase = "drive_download"
    const response = await fetch(downloadUrl, { cache: "no-store", signal: AbortSignal.timeout(45_000) })
    if (!response.ok) return fallbackResponse("drive_download_failed")
    const pdfBytes = new Uint8Array(await response.arrayBuffer())
    if (pdfBytes.byteLength !== size || Buffer.from(pdfBytes).subarray(0, 5).toString("ascii") !== "%PDF-") return fallbackResponse("invalid_pdf_download")
    phase = "render"
    const image = await renderFirstPagePreview(pdfBytes)
    return new NextResponse(image, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return fallbackResponse(phase)
  }
}
