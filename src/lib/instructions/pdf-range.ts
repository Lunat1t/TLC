export type ParsedRange =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "unsatisfiable" }
  | { kind: "bounded"; start: number; end: number }
  | { kind: "open"; start: number }
  | { kind: "suffix"; suffix: number }

export type ResolvedByteRange =
  | { ok: true; start: number; end: number; totalSize: number }
  | { ok: false; status: 413 | 416; totalSize?: number }

export type ParsedContentRange =
  | { kind: "range"; start: number; end: number; total: number }
  | { kind: "unsatisfied"; total: number }

export function parseHttpRangeHeader(header: string | null, maxBytes: number): ParsedRange {
  if (header === null) return { kind: "none" }
  const trimmed = header.trim()
  if (!trimmed || trimmed.includes(",")) return { kind: "invalid" }

  const match = /^bytes=(.+)$/i.exec(trimmed)
  if (!match) return { kind: "invalid" }

  const spec = match[1].trim()
  if (!spec || /\s/.test(spec)) return { kind: "invalid" }

  const bounded = /^(\d+)-(\d+)$/.exec(spec)
  if (bounded) {
    const start = Number(bounded[1])
    const end = Number(bounded[2])
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
      return { kind: "invalid" }
    }
    if (start >= maxBytes) return { kind: "unsatisfiable" }
    return { kind: "bounded", start, end: Math.min(end, maxBytes - 1) }
  }

  const open = /^(\d+)-$/.exec(spec)
  if (open) {
    const start = Number(open[1])
    if (!Number.isSafeInteger(start)) return { kind: "invalid" }
    if (start >= maxBytes) return { kind: "unsatisfiable" }
    return { kind: "open", start }
  }

  const suffixMatch = /^-(\d+)$/.exec(spec)
  if (suffixMatch) {
    const suffix = Number(suffixMatch[1])
    if (!Number.isSafeInteger(suffix)) return { kind: "invalid" }
    if (suffix <= 0) return { kind: "unsatisfiable" }
    return { kind: "suffix", suffix: Math.min(suffix, maxBytes) }
  }

  return { kind: "invalid" }
}

export function resolveRangeForTotalSize(
  parsed: Exclude<ParsedRange, { kind: "none" }>,
  totalSize: number,
  maxBytes: number,
): ResolvedByteRange {
  if (parsed.kind === "invalid" || parsed.kind === "unsatisfiable") {
    return { ok: false, status: 416, totalSize: Number.isSafeInteger(totalSize) && totalSize >= 0 ? totalSize : undefined }
  }
  if (!Number.isSafeInteger(totalSize) || totalSize < 0) {
    return { ok: false, status: 416 }
  }
  if (totalSize > maxBytes) {
    return { ok: false, status: 413, totalSize }
  }
  if (totalSize === 0) {
    return { ok: false, status: 416, totalSize: 0 }
  }

  if (parsed.kind === "bounded") {
    if (parsed.start >= totalSize) return { ok: false, status: 416, totalSize }
    const end = Math.min(parsed.end, totalSize - 1)
    if (parsed.start > end) return { ok: false, status: 416, totalSize }
    return { ok: true, start: parsed.start, end, totalSize }
  }

  if (parsed.kind === "open") {
    if (parsed.start >= totalSize) return { ok: false, status: 416, totalSize }
    return { ok: true, start: parsed.start, end: totalSize - 1, totalSize }
  }

  const start = Math.max(0, totalSize - parsed.suffix)
  return { ok: true, start, end: totalSize - 1, totalSize }
}

export function parseContentRangeHeader(header: string | null): ParsedContentRange | null {
  if (!header) return null
  const trimmed = header.trim()

  const rangeMatch = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(trimmed)
  if (rangeMatch) {
    const start = Number(rangeMatch[1])
    const end = Number(rangeMatch[2])
    const total = Number(rangeMatch[3])
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      !Number.isSafeInteger(total) ||
      start < 0 ||
      end < start ||
      end >= total
    ) {
      return null
    }
    return { kind: "range", start, end, total }
  }

  const unsatisfiedMatch = /^bytes\s+\*\/(\d+)$/i.exec(trimmed)
  if (unsatisfiedMatch) {
    const total = Number(unsatisfiedMatch[1])
    if (!Number.isSafeInteger(total) || total < 0) return null
    return { kind: "unsatisfied", total }
  }

  return null
}

export function formatUpstreamRangeHeader(
  parsed: Extract<ParsedRange, { kind: "bounded" | "open" | "suffix" }>,
  maxBytes: number,
): string {
  if (parsed.kind === "bounded") {
    return `bytes=${parsed.start}-${Math.min(parsed.end, maxBytes - 1)}`
  }
  if (parsed.kind === "open") {
    return `bytes=${parsed.start}-`
  }
  return `bytes=-${Math.min(parsed.suffix, maxBytes)}`
}

export function createBoundedRangeReadableStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  initialChunk: Uint8Array | null,
  expectedBytes: number,
): ReadableStream<Uint8Array> {
  let pending: Uint8Array | null = initialChunk
  let sent = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (sent >= expectedBytes) {
          controller.close()
          void reader.cancel().catch(() => {})
          return
        }
        if (pending && pending.byteLength > 0) {
          const take = Math.min(pending.byteLength, expectedBytes - sent)
          controller.enqueue(take === pending.byteLength ? pending : pending.subarray(0, take))
          sent += take
          pending = null
          if (sent >= expectedBytes) {
            controller.close()
            void reader.cancel().catch(() => {})
          }
          return
        }
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            if (sent < expectedBytes) throw new Error("truncated_range")
            controller.close()
            return
          }
          if (!value || value.byteLength === 0) continue
          const remaining = expectedBytes - sent
          const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value
          controller.enqueue(slice)
          sent += slice.byteLength
          if (sent >= expectedBytes) {
            controller.close()
            void reader.cancel().catch(() => {})
          }
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
}
