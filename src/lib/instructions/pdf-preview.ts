export const MAX_AUTO_PREVIEW_PDF_BYTES = 30 * 1024 * 1024

export async function renderFirstPagePreview(pdfBytes: Uint8Array) {
  const [{ getDocument }, { createCanvas }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("@napi-rs/canvas"),
  ])
  const loadingTask = getDocument({
    data: pdfBytes,
    useSystemFonts: true,
    maxImageSize: 16_777_216,
  })
  const pdf = await loadingTask.promise

  try {
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const width = 720
    const height = 480
    const padding = 24
    const scale = Math.min((width - padding * 2) / viewport.width, (height - padding * 2) / viewport.height)
    const offsetX = (width - viewport.width * scale) / 2
    const offsetY = (height - viewport.height * scale) / 2
    const canvas = createCanvas(width, height)
    const context = canvas.getContext("2d")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, width, height)
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      transform: [scale, 0, 0, scale, offsetX, offsetY],
      background: "#ffffff",
    }).promise
    page.cleanup()
    return new Uint8Array(canvas.toBuffer("image/jpeg", 82))
  } finally {
    await loadingTask.destroy()
  }
}
