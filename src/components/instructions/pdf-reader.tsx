"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react"
import Link from "next/link"
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCw,
} from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { useWorkspaceSettings } from "@/components/lab/workspace-settings"
import type { Kit } from "@/lib/instructions/types"
import {
  READER_ZOOM_OPTIONS,
  calculateReaderScale,
  calculateCanvasPixelRatio,
  clampPageNumber,
  deleteCachedPdfBytes,
  loadStoredReaderState,
  normalizeReaderUserId,
  normalizeZoom,
  readCachedPdfBytes,
  rotateClockwise,
  saveStoredReaderState,
  selectPreloadPages,
  writeCachedPdfBytes,
  type PdfRotation,
  type ReaderZoom,
} from "@/lib/instructions/reader-storage"

interface PdfReaderProps {
  slug: string
  title: string
  kit?: Kit
  initialUserId?: string
}

interface GateBlockedState {
  status: number
  message: string
  href: string
  cta: string
}

interface PreRenderedEntry {
  key: string
  page: number
  canvas: HTMLCanvasElement
  cssWidth: number
  cssHeight: number
}

const ZOOM_LABELS: Record<ReaderZoom, string> = {
  1: "По ширине",
  1.25: "125%",
  1.5: "150%",
  2: "200%",
}

export function PdfReader({ slug, title, kit, initialUserId = "anon" }: PdfReaderProps) {
  const { userId: sessionUserId, ready: accessReady } = useAccess()
  const { settings } = useWorkspaceSettings()
  const effectiveUserId = normalizeReaderUserId(accessReady ? sessionUserId : initialUserId)
  const theme = settings.theme === "dark" ? "dark" : "light"

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [pageDraft, setPageDraft] = useState("1")
  const [rotation, setRotation] = useState<PdfRotation>(0)
  const [zoom, setZoom] = useState<ReaderZoom>(1)
  const [stateReady, setStateReady] = useState(false)
  const [busy, setBusy] = useState(true)
  const [fitMode, setFitMode] = useState<"page" | "width">("page")
  const [loadProgress, setLoadProgress] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [gateBlocked, setGateBlocked] = useState<GateBlockedState | null>(null)
  const [offlineCached, setOfflineCached] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false)

  const readerRef = useRef<HTMLElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const preRenderedRef = useRef<Map<string, PreRenderedEntry>>(new Map())
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const [size, setSize] = useState({ width: 640, height: 480 })
  const { width, height } = size

  const mapHref = kit ? `/map?kit=${encodeURIComponent(kit)}` : "/map"
  const downloadHref = `/api/instructions/${encodeURIComponent(slug)}/download`

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    let frame = 0
    const updateWidth = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const style = getComputedStyle(el)
        const width = Math.max(1, el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
        const height = Math.max(1, el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
        setSize((prev) => prev.width === width && prev.height === height ? prev : { width, height })
      })
    }
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(el)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === readerRef.current)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const node = readerRef.current
    if (!node) return
    if (document.fullscreenElement === node) {
      void document.exitFullscreen().catch(() => {
        setIsFullscreen(false)
        setIsPseudoFullscreen(false)
      })
      return
    }
    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false)
      return
    }
    if (typeof node.requestFullscreen === "function") {
      void node.requestFullscreen().catch(() => {
        setIsPseudoFullscreen(true)
      })
      return
    }
    setIsPseudoFullscreen(true)
  }, [isPseudoFullscreen])

  // Clear pre-rendered cache whenever layout/document parameters change.
  useEffect(() => {
    preRenderedRef.current.clear()
  }, [pdf, effectiveUserId, width, height, fitMode, zoom, rotation])

  // Load document (with user-scoped IndexedDB cache + live gate re-check).
  useEffect(() => {
    let alive = true
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined

    preRenderedRef.current.clear()
    setPdf(null)
    setStateReady(false)
    setBusy(true)
    setError("")
    setGateBlocked(null)
    setOfflineCached(false)
    setLoadProgress(null)

    const saved = loadStoredReaderState(effectiveUserId, slug)
    setPage(saved.page)
    setRotation(saved.rotation)

    async function openFromNetwork(lib: typeof import("pdfjs-dist")): Promise<PDFDocumentProxy> {
      const loadingTask = lib.getDocument({
        url: `/api/instructions/${encodeURIComponent(slug)}/document`,
        rangeChunkSize: 262144,
      })
      task = loadingTask
      loadingTask.onProgress = (progressData: { loaded: number; total: number }) => {
        if (!alive) return
        if (progressData.total > 0) {
          setLoadProgress(Math.min(100, Math.round((progressData.loaded / progressData.total) * 100)))
        }
      }
      const doc = await loadingTask.promise
      void doc
        .getData()
        .then((bytes) => {
          if (alive) return writeCachedPdfBytes(effectiveUserId, slug, bytes)
        })
        .catch(() => {})
      return doc
    }

    async function verifyCacheAccess(): Promise<"allow" | "offline-allow" | "blocked" | "error"> {
      try {
        const res = await fetch(`/api/instructions/${encodeURIComponent(slug)}`, { cache: "no-store" })
        if (res.ok) return "allow"
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          await deleteCachedPdfBytes(effectiveUserId, slug)
          let message =
            res.status === 401
              ? "Войдите в Brick Studio, чтобы открыть эту инструкцию."
              : "Нет доступа к этой инструкции."
          try {
            const body = (await res.json()) as { error?: { message?: string } }
            if (body?.error?.message) message = body.error.message
          } catch {}
          if (alive) {
            setGateBlocked({
              status: res.status,
              message,
              href:
                res.status === 401
                  ? `/login?next=${encodeURIComponent(`/instructions/${slug}/read`)}`
                  : mapHref,
              cta: res.status === 401 ? "Войти в аккаунт" : "Открыть роадмап",
            })
            setBusy(false)
          }
          return "blocked"
        }
        return "error"
      } catch {
        if (effectiveUserId === normalizeReaderUserId(initialUserId)) {
          return "offline-allow"
        }
        return "error"
      }
    }

    void (async () => {
      try {
        const lib = await import("pdfjs-dist")
        if (!alive) return
        lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs"

        const cachedBytes = await readCachedPdfBytes(effectiveUserId, slug)
        if (!alive) return

        let doc: PDFDocumentProxy | null = null
        if (cachedBytes) {
          const verdict = await verifyCacheAccess()
          if (!alive || verdict === "blocked") return
          if (verdict === "allow" || verdict === "offline-allow") {
            try {
              const cacheTask = lib.getDocument({ data: cachedBytes })
              task = cacheTask
              doc = await cacheTask.promise
              if (alive && verdict === "offline-allow") setOfflineCached(true)
            } catch {
              await deleteCachedPdfBytes(effectiveUserId, slug)
              doc = null
            }
          } else {
            throw new Error("gate_unavailable")
          }
        }

        if (!doc) {
          doc = await openFromNetwork(lib)
        }
        if (!alive || !doc) return

        setPdf(doc)
        setPage((prev) => clampPageNumber(prev, doc.numPages))
        setStateReady(true)
        setLoadProgress(100)
        setBusy(false)
      } catch {
        if (!alive) return
        setError("Не удалось открыть PDF. Проверьте соединение и повторите или скачайте оригинал.")
        setBusy(false)
      }
    })()

    return () => {
      alive = false
      void task?.destroy()
    }
  }, [slug, effectiveUserId, initialUserId, mapHref, retryToken])

  useEffect(() => {
    setPageDraft(String(page))
  }, [page])

  const commitPageDraft = useCallback(
    (raw: string) => {
      if (!pdf) {
        setPageDraft(String(page))
        return
      }
      const trimmed = raw.trim()
      if (!/^\d+$/.test(trimmed)) {
        setPageDraft(String(page))
        return
      }
      const next = clampPageNumber(trimmed, pdf.numPages)
      setPage(next)
      setPageDraft(String(next))
    },
    [pdf, page],
  )

  // Persist user-scoped page & rotation once the document is hydrated.
  useEffect(() => {
    if (!pdf || !stateReady) return
    saveStoredReaderState(effectiveUserId, slug, page, rotation)
  }, [pdf, stateReady, effectiveUserId, slug, page, rotation])

  // Render current page + pre-render +/-1 pages in offscreen canvases.
  useEffect(() => {
    if (!pdf) return
    const currentPdf = pdf
    let cancelled = false
    let activeRender: RenderTask | undefined
    const preloadRenders: RenderTask[] = []

    let preloadTimer: ReturnType<typeof setTimeout> | undefined
    const currentKey = `${page}:${width}:${height}:${fitMode}:${zoom}:${rotation}`

    async function renderPageToCanvas(targetPage: number, targetCanvas: HTMLCanvasElement, trackActive: boolean) {
      const pdfPage = await currentPdf.getPage(targetPage)
      if (cancelled) return null
      const effectiveRotation = (pdfPage.rotate + rotation) % 360
      const baseView = pdfPage.getViewport({ scale: 1, rotation: effectiveRotation })
      const fitScale = calculateReaderScale(width, height, baseView.width, baseView.height, fitMode)
      const viewport = pdfPage.getViewport({ scale: fitScale * zoom, rotation: effectiveRotation })

      const ratio = calculateCanvasPixelRatio(viewport.width, viewport.height, window.devicePixelRatio)
      targetCanvas.width = Math.max(1, Math.floor(viewport.width * ratio))
      targetCanvas.height = Math.max(1, Math.floor(viewport.height * ratio))
      targetCanvas.style.width = `${viewport.width}px`
      targetCanvas.style.height = `${viewport.height}px`

      const task = pdfPage.render({
        canvas: targetCanvas,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      })
      if (trackActive) activeRender = task
      else preloadRenders.push(task)

      await task.promise
      return { cssWidth: viewport.width, cssHeight: viewport.height }
    }

    async function preloadNeighbors() {
      const neighbors = selectPreloadPages(page, currentPdf.numPages)
      for (const neighbor of neighbors) {
        if (cancelled) return
        const key = `${neighbor}:${width}:${height}:${fitMode}:${zoom}:${rotation}`
        if (preRenderedRef.current.has(key)) continue
        const offscreen = document.createElement("canvas")
        try {
          const size = await renderPageToCanvas(neighbor, offscreen, false)
          if (cancelled || !size) return
          preRenderedRef.current.set(key, {
            key,
            page: neighbor,
            canvas: offscreen,
            cssWidth: size.cssWidth,
            cssHeight: size.cssHeight,
          })
          for (const [entryKey, entry] of preRenderedRef.current) {
            if (Math.abs(entry.page - page) > 2 || preRenderedRef.current.size > 5) {
              if (entryKey !== key) preRenderedRef.current.delete(entryKey)
            }
          }
        } catch {
          // Ignore cancelled background pre-render errors.
        }
      }
    }

    function showCanvas(source: HTMLCanvasElement, cssWidth: number, cssHeight: number) {
      const target = canvasRef.current
      if (cancelled || !target) return
      target.width = source.width
      target.height = source.height
      target.style.width = `${cssWidth}px`
      target.style.height = `${cssHeight}px`
      target.getContext("2d")?.drawImage(source, 0, 0)
      areaRef.current?.scrollTo(0, 0)
    }

    function schedulePreload() {
      preloadTimer = setTimeout(() => { void preloadNeighbors() }, 250)
    }

    const cachedEntry = preRenderedRef.current.get(currentKey)
    if (cachedEntry && canvasRef.current) {
      showCanvas(cachedEntry.canvas, cachedEntry.cssWidth, cachedEntry.cssHeight)
      setError("")
      setBusy(false)
      schedulePreload()
    } else if (canvasRef.current) {
      setBusy(true)
      setError("")
      // Render into a private canvas so rapid resize/page changes cannot
      // race a cancelled PDF.js render using the same visible canvas.
      const offscreen = document.createElement("canvas")
      void renderPageToCanvas(page, offscreen, true)
        .then((size) => {
          if (cancelled || !size) return
          showCanvas(offscreen, size.cssWidth, size.cssHeight)
          setBusy(false)
          schedulePreload()
        })
        .catch(() => {
          if (cancelled) return
          setError("Не удалось показать страницу.")
          setBusy(false)
        })
    }

    return () => {
      cancelled = true
      clearTimeout(preloadTimer)
      activeRender?.cancel()
      for (const task of preloadRenders) {
        task.cancel()
      }
    }
  }, [pdf, page, width, height, fitMode, zoom, rotation])

  // Keyboard navigation: Left/Right arrows + Escape for pseudo-fullscreen.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isPseudoFullscreen) {
        event.preventDefault()
        setIsPseudoFullscreen(false)
        return
      }
      if (!pdf) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        setPage((p) => Math.max(1, p - 1))
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        setPage((p) => Math.min(pdf.numPages, p + 1))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [pdf, isPseudoFullscreen])

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (zoom !== 1 || event.touches.length !== 1) {
      touchStartRef.current = null
      return
    }
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || !pdf || zoom !== 1 || event.changedTouches.length !== 1) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const dt = Date.now() - start.time
    if (dt > 800 || Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.4) return
    if (dx < 0) {
      setPage((p) => Math.min(pdf.numPages, p + 1))
    } else {
      setPage((p) => Math.max(1, p - 1))
    }
  }

  const activeFullscreen = isFullscreen || isPseudoFullscreen
  const isFinalPage = Boolean(pdf && page >= pdf.numPages)
  const progressPct = pdf
    ? pdf.numPages > 1
      ? Math.round(((page - 1) / (pdf.numPages - 1)) * 100)
      : 100
    : 0

  return (
    <main
      ref={readerRef}
      data-theme={theme}
      className={`pdf-reader${activeFullscreen ? " is-fullscreen" : ""}`}
    >
      <header className="pdf-header">
        <div className="pdf-header-main">
          <Link href={`/instructions/${encodeURIComponent(slug)}`} className="pdf-back-link">
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Инструкция</span>
          </Link>
          <strong title={title}>{title}</strong>
          <span className="pdf-counter" aria-label="Текущая страница">
            {pdf ? `${page} / ${pdf.numPages}` : "…"}
          </span>
        </div>

        <div className="pdf-header-actions">
          <button
            type="button"
            className="pdf-tool-btn"
            disabled={!pdf}
            onClick={() => setRotation((r) => rotateClockwise(r))}
            aria-label="Повернуть на 90°"
            title="Повернуть на 90°"
          >
            <RotateCw size={18} aria-hidden="true" />
            <span className="pdf-btn-label">Поворот</span>
          </button>

          <label className="pdf-zoom-wrap">
            <span className="sr-only">Масштаб</span>
            <select
              aria-label="Масштаб"
              value={zoom === 1 ? fitMode : zoom}
              disabled={!pdf}
              onChange={(e) => {
                const value = e.target.value
                if (value === "page" || value === "width") {
                  setFitMode(value)
                  setZoom(1)
                } else setZoom(normalizeZoom(Number(value)))
              }}
            >
              <option value="page">Вся страница</option>
              <option value="width">По ширине</option>
              {READER_ZOOM_OPTIONS.filter((opt) => opt !== 1).map((opt) => (
                <option key={opt} value={opt}>
                  {ZOOM_LABELS[opt]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="pdf-tool-btn"
            onClick={toggleFullscreen}
            aria-pressed={activeFullscreen}
            aria-label={activeFullscreen ? "Выйти из полноэкранного режима" : "Во весь экран"}
            title={activeFullscreen ? "Выйти из полноэкранного режима" : "Во весь экран"}
          >
            {activeFullscreen ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
            <span className="pdf-btn-label">{activeFullscreen ? "Свернуть" : "Во весь экран"}</span>
          </button>

          <a
            href={downloadHref}
            className="pdf-tool-btn"
            aria-label="Скачать PDF"
            title="Скачать PDF"
          >
            <Download size={18} aria-hidden="true" />
            <span className="pdf-btn-label">Скачать</span>
          </a>
        </div>
      </header>

      <div
        ref={areaRef}
        className={`pdf-paper-area${zoom > 1 ? " is-zoomed" : ""}`}
        aria-busy={busy}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {offlineCached && (
          <div className="pdf-status-pill" role="status">
            Офлайн-режим (из локального кэша)
          </div>
        )}

        {!pdf && busy && !error && !gateBlocked && (
          <div className="pdf-state-card" role="status">
            <p>
              {loadProgress !== null
                ? `Загрузка инструкции… ${loadProgress}%`
                : "Открытие инструкции…"}
            </p>
            <div className="pdf-progress-track" aria-hidden="true">
              <div
                className={`pdf-progress-fill${loadProgress === null ? " is-indeterminate" : ""}`}
                style={loadProgress !== null ? { width: `${loadProgress}%` } : undefined}
              />
            </div>
          </div>
        )}

        {gateBlocked && (
          <div className="pdf-state-card is-error" role="alert">
            <p>{gateBlocked.message}</p>
            <div className="pdf-state-actions">
              <Link className="pdf-cta-primary" href={gateBlocked.href}>
                {gateBlocked.cta}
              </Link>
            </div>
          </div>
        )}

        {error && !gateBlocked && (
          <div className="pdf-state-card is-error" role="alert">
            <p>{error}</p>
            <div className="pdf-state-actions">
              <button
                type="button"
                className="pdf-cta-primary"
                onClick={() => setRetryToken((token) => token + 1)}
              >
                <RefreshCw size={16} aria-hidden="true" />
                <span>Повторить</span>
              </button>
              <a className="pdf-cta-secondary" href={downloadHref}>
                <Download size={16} aria-hidden="true" />
                <span>Скачать PDF</span>
              </a>
            </div>
          </div>
        )}

        {pdf && busy && !error && (
          <div className="pdf-status-pill" role="status">
            Загрузка страницы…
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="pdf-canvas"
          hidden={Boolean(gateBlocked || !pdf)}
          aria-label={`Страница ${page} из ${pdf?.numPages ?? "…"}: ${title}`}
        />
      </div>

      {isFinalPage && (
        <div className="pdf-finish-bar" role="region" aria-label="Следующие шаги после сборки">
          <span className="pdf-finish-text">Финальный шаг! Куда дальше?</span>
          <div className="pdf-finish-actions">
            <Link className="pdf-cta-primary" href={mapHref}>
              На роадмап
            </Link>
            <Link className="pdf-cta-secondary" href="/editor">
              В редактор
            </Link>
          </div>
        </div>
      )}

      <footer className="pdf-footer">
        <button
          type="button"
          className="pdf-step-btn pdf-step-prev"
          disabled={!pdf || page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          aria-label="Предыдущая страница"
        >
          <ChevronLeft size={24} aria-hidden="true" />
          <span className="pdf-step-label">Назад</span>
        </button>

        <div className="pdf-pager">
          <input
            className="pdf-range"
            type="range"
            aria-label="Ползунок страниц"
            min={1}
            max={pdf?.numPages || 1}
            value={page}
            disabled={!pdf}
            style={{ "--pdf-progress": `${progressPct}%` } as CSSProperties}
            onChange={(e) => {
              if (pdf) setPage(clampPageNumber(e.target.value, pdf.numPages))
            }}
          />
          <label className="pdf-page-box">
            <span className="sr-only">Номер страницы</span>
            <input
              aria-label="Номер страницы"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageDraft}
              disabled={!pdf}
              onChange={(e) => setPageDraft(e.target.value)}
              onBlur={() => commitPageDraft(pageDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitPageDraft(pageDraft)
                  e.currentTarget.blur()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  e.stopPropagation()
                  setPageDraft(String(page))
                  e.currentTarget.blur()
                }
              }}
            />
            <span>/ {pdf?.numPages || "…"}</span>
          </label>
        </div>

        <button
          type="button"
          className="pdf-step-btn pdf-step-next"
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => setPage((p) => (pdf ? Math.min(pdf.numPages, p + 1) : p))}
          aria-label="Следующая страница"
        >
          <span className="pdf-step-label">Дальше</span>
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      </footer>
    </main>
  )
}
