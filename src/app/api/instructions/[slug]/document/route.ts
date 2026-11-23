import { NextResponse } from "next/server"
import { errorResponse, InstructionError, serverClient } from "@/lib/instructions/access"
import { requireInstructionGate } from "@/lib/instructions/roadmap-gate"
import { publicDriveDownloadUrl, MAX_PDF_BYTES } from "@/lib/instructions/google-drive"
import {
  createBoundedRangeReadableStream,
  formatUpstreamRangeHeader,
  parseContentRangeHeader,
  parseHttpRangeHeader,
  resolveRangeForTotalSize,
} from "@/lib/instructions/pdf-range"

export const runtime = "nodejs"
export const maxDuration = 60

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function pdfBaseHeaders(extra?: Record<string, string>) {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  }
}

function rangeNotSatisfiableResponse(totalSize?: number) {
  const extra = typeof totalSize === "number" ? { "Content-Range": `bytes */${totalSize}` } : undefined
  return new NextResponse(null, {
    status: 416,
    headers: pdfBaseHeaders(extra),
  })
}

function isHtmlContentType(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  return contentType.startsWith("text/html")
}

function parsePositiveLength(response: Response): number | null {
  const raw = response.headers.get("content-length")
  if (raw === null) return null
  const num = Number(raw)
  if (!Number.isSafeInteger(num) || num < 0) return -1
  return num
}

async function resolveDriveUrl(slug: string): Promise<string> {
  if (!SLUG_PATTERN.test(slug)) {
    throw new InstructionError(404, "not_found", "Инструкция не найдена.")
  }
  await requireInstructionGate(slug)
  const client = await serverClient()
  const { data: fileId, error } = await client.rpc("published_instruction_drive_file", { p_slug: slug })
  if (error || typeof fileId !== "string") throw new InstructionError(404, "not_found", "PDF не найден.")
  return publicDriveDownloadUrl(fileId)
}

async function readPrefixAndVerifyPdf(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  minBytes: number,
): Promise<{ prefix: Uint8Array; totalRead: number }> {
  const chunks: Uint8Array[] = []
  let totalRead = 0
  while (totalRead < minBytes) {
    const { done, value } = await reader.read()
    if (done || !value?.byteLength) throw new Error("truncated_pdf")
    chunks.push(value)
    totalRead += value.byteLength
    if (totalRead > MAX_PDF_BYTES) throw new Error("large_pdf")
  }
  const prefix = Buffer.concat(chunks, totalRead)
  if (totalRead >= 5 && prefix.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("invalid_pdf")
  }
  return { prefix: new Uint8Array(prefix), totalRead }
}

function streamFullVerifiedPdf(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  initialChunk: Uint8Array,
  initialTotal: number,
  declaredSize: number | null,
) {
  let firstChunk: Uint8Array | null = initialChunk
  let received = initialTotal
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (firstChunk) {
        controller.enqueue(firstChunk)
        firstChunk = null
        return
      }
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          if (!value || value.byteLength === 0) continue
          received += value.byteLength
          if (received > MAX_PDF_BYTES) throw new Error("large_pdf")
          controller.enqueue(value)
          return
        }
      } catch (cause) {
        controller.error(cause)
        void reader.cancel(cause).catch(() => {})
      }
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => {})
    },
  })
  const headers = pdfBaseHeaders({
    "Content-Type": "application/pdf",
    ...(declaredSize !== null && declaredSize > 0 ? { "Content-Length": String(declaredSize) } : {}),
  })
  return new NextResponse(body, { status: 200, headers })
}

function streamBoundedRange(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  initialChunk: Uint8Array | null,
  expectedBytes: number,
  start: number,
  end: number,
  total: number,
) {
  const body = createBoundedRangeReadableStream(reader, initialChunk, expectedBytes)
  return new NextResponse(body, {
    status: 206,
    headers: pdfBaseHeaders({
      "Content-Type": "application/pdf",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(expectedBytes),
    }),
  })
}

export async function HEAD(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const driveUrl = await resolveDriveUrl(slug)
    const response = await fetch(driveUrl, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
    await response.body?.cancel().catch(() => {})
    if (!response.ok || isHtmlContentType(response)) {
      throw new InstructionError(503, "pdf_unavailable", "Не удалось загрузить PDF.")
    }
    const declaredSize = parsePositiveLength(response)
    if (declaredSize !== null && (declaredSize < 0 || declaredSize > MAX_PDF_BYTES)) {
      throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
    }
    return new NextResponse(null, {
      status: 200,
      headers: pdfBaseHeaders({
        "Content-Type": "application/pdf",
        ...(declaredSize !== null && declaredSize > 0 ? { "Content-Length": String(declaredSize) } : {}),
      }),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const parsedRange = parseHttpRangeHeader(request.headers.get("range"), MAX_PDF_BYTES)
    if (parsedRange.kind === "invalid" || parsedRange.kind === "unsatisfiable") {
      // Still verify access before answering range status so unauthorized callers do not probe existence.
      await resolveDriveUrl(slug)
      return rangeNotSatisfiableResponse()
    }

    const driveUrl = await resolveDriveUrl(slug)

    if (parsedRange.kind === "none") {
      const response = await fetch(driveUrl, {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      })
      if (!response.ok || !response.body || isHtmlContentType(response)) {
        await response.body?.cancel().catch(() => {})
        throw new InstructionError(503, "pdf_unavailable", "Не удалось загрузить PDF.")
      }
      const declaredSize = parsePositiveLength(response)
      if (declaredSize !== null && (declaredSize < 0 || declaredSize > MAX_PDF_BYTES)) {
        await response.body.cancel().catch(() => {})
        throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
      }
      const reader = response.body.getReader()
      try {
        const { prefix, totalRead } = await readPrefixAndVerifyPdf(reader, 5)
        return streamFullVerifiedPdf(reader, prefix, totalRead, declaredSize)
      } catch {
        await reader.cancel().catch(() => {})
        throw new InstructionError(503, "pdf_unavailable", "Google Drive не отдал корректный PDF.")
      }
    }

    const upstreamRange = formatUpstreamRangeHeader(parsedRange, MAX_PDF_BYTES)
    const response = await fetch(driveUrl, {
      headers: { Range: upstreamRange },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    })

    if (response.status === 416) {
      await response.body?.cancel().catch(() => {})
      const cr = parseContentRangeHeader(response.headers.get("content-range"))
      if (cr?.kind === "unsatisfied") {
        if (cr.total > MAX_PDF_BYTES) throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
        return rangeNotSatisfiableResponse(cr.total)
      }
      return rangeNotSatisfiableResponse()
    }

    if (!response.ok || !response.body || isHtmlContentType(response)) {
      await response.body?.cancel().catch(() => {})
      throw new InstructionError(503, "pdf_unavailable", "Не удалось загрузить PDF.")
    }

    if (response.status === 206) {
      const cr = parseContentRangeHeader(response.headers.get("content-range"))
      if (!cr || cr.kind !== "range") {
        await response.body.cancel().catch(() => {})
        throw new InstructionError(503, "pdf_unavailable", "Google Drive вернул некорректный диапазон PDF.")
      }
      if (cr.total > MAX_PDF_BYTES) {
        await response.body.cancel().catch(() => {})
        throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
      }
      const expectedBytes = cr.end - cr.start + 1
      if (expectedBytes <= 0 || expectedBytes > MAX_PDF_BYTES) {
        await response.body.cancel().catch(() => {})
        throw new InstructionError(503, "pdf_unavailable", "Google Drive вернул некорректный размер диапазона.")
      }
      const reader = response.body.getReader()
      try {
        let initialChunk: Uint8Array | null = null
        if (cr.start === 0 && expectedBytes >= 5) {
          const { prefix } = await readPrefixAndVerifyPdf(reader, 5)
          initialChunk = prefix.byteLength > expectedBytes ? prefix.subarray(0, expectedBytes) : prefix
        }
        return streamBoundedRange(reader, initialChunk, expectedBytes, cr.start, cr.end, cr.total)
      } catch {
        await reader.cancel().catch(() => {})
        throw new InstructionError(503, "pdf_unavailable", "Google Drive не отдал корректный PDF.")
      }
    }

    // Fallback when upstream returns 200 OK instead of 206 Partial Content.
    const declaredSize = parsePositiveLength(response)
    if (declaredSize !== null && (declaredSize < 0 || declaredSize > MAX_PDF_BYTES)) {
      await response.body.cancel().catch(() => {})
      throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
    }

    const reader = response.body.getReader()
    if (declaredSize !== null && declaredSize > 0) {
      const resolved = resolveRangeForTotalSize(parsedRange, declaredSize, MAX_PDF_BYTES)
      if (!resolved.ok) {
        await reader.cancel().catch(() => {})
        if (resolved.status === 413) throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
        return rangeNotSatisfiableResponse(resolved.totalSize)
      }
      try {
        const prefixMin = Math.min(5, declaredSize)
        const { prefix } = await readPrefixAndVerifyPdf(reader, prefixMin)
        let offset = 0
        let firstSlice: Uint8Array | null = null
        const targetStart = resolved.start
        const targetEnd = resolved.end
        const expectedBytes = targetEnd - targetStart + 1

        // Advance through prefix and subsequent chunks until offset reaches targetStart.
        const considerChunk = (chunk: Uint8Array) => {
          const chunkStart = offset
          const chunkEnd = offset + chunk.byteLength - 1
          offset += chunk.byteLength
          if (chunkEnd < targetStart || chunkStart > targetEnd) return
          const sliceFrom = Math.max(0, targetStart - chunkStart)
          const sliceTo = Math.min(chunk.byteLength, targetEnd - chunkStart + 1)
          firstSlice = chunk.subarray(sliceFrom, sliceTo)
        }

        considerChunk(prefix)
        while (firstSlice === null) {
          const { done, value } = await reader.read()
          if (done) throw new Error("truncated_pdf")
          if (!value?.byteLength) continue
          if (offset + value.byteLength > MAX_PDF_BYTES) throw new Error("large_pdf")
          considerChunk(value)
        }
        return streamBoundedRange(reader, firstSlice, expectedBytes, targetStart, targetEnd, declaredSize)
      } catch {
        await reader.cancel().catch(() => {})
        throw new InstructionError(503, "pdf_unavailable", "Google Drive не отдал корректный PDF.")
      }
    }

    // Unknown Content-Length on 200 fallback: read bounded buffer up to MAX_PDF_BYTES.
    try {
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value?.byteLength) continue
        total += value.byteLength
        if (total > MAX_PDF_BYTES) {
          await reader.cancel().catch(() => {})
          throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
        }
        chunks.push(value)
      }
      const full = Buffer.concat(chunks, total)
      if (total < 5 || full.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new InstructionError(503, "pdf_unavailable", "Google Drive не отдал корректный PDF.")
      }
      const resolved = resolveRangeForTotalSize(parsedRange, total, MAX_PDF_BYTES)
      if (!resolved.ok) {
        if (resolved.status === 413) throw new InstructionError(413, "large_pdf", "PDF превышает лимит 100 МБ.")
        return rangeNotSatisfiableResponse(resolved.totalSize)
      }
      const slice = full.subarray(resolved.start, resolved.end + 1)
      return new NextResponse(slice, {
        status: 206,
        headers: pdfBaseHeaders({
          "Content-Type": "application/pdf",
          "Content-Range": `bytes ${resolved.start}-${resolved.end}/${total}`,
          "Content-Length": String(slice.byteLength),
        }),
      })
    } catch (error) {
      await reader.cancel().catch(() => {})
      if (error instanceof InstructionError) throw error
      throw new InstructionError(503, "pdf_unavailable", "Google Drive не отдал корректный PDF.")
    }
  } catch (error) {
    return errorResponse(error)
  }
}
