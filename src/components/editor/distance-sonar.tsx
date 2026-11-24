"use client"

import * as React from 'react'
import { getSonarZoneStyle } from '@/lib/distance-sonar'

const IDLE_DOT_COLOR = '#334155'
const IDLE_CENTER_COLOR = '#475569'
const BACKGROUND_COLOR = '#0f172a'

function drawSonarFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  distance: number | null | undefined,
  phase: number,
) {
  if (width <= 0 || height <= 0) return

  ctx.fillStyle = BACKGROUND_COLOR
  ctx.fillRect(0, 0, width, height)

  const style = getSonarZoneStyle(distance)
  const step = Math.max(8, Math.min(10, Math.round(Math.min(width, height) / 5)))
  const cols = Math.max(3, Math.floor((width - 8) / step) + 1)
  const rows = Math.max(2, Math.floor((height - 8) / step) + 1)
  const startX = (width - (cols - 1) * step) / 2
  const startY = (height - (rows - 1) * step) / 2
  const cx = width / 2
  const cy = height / 2
  const maxDist = Math.hypot(cx, cy) || 1

  if (style.zone === 'idle') {
    ctx.fillStyle = IDLE_DOT_COLOR
    for (let r = 0; r < rows; r++) {
      const y = startY + r * step
      for (let c = 0; c < cols; c++) {
        const x = startX + c * step
        ctx.beginPath()
        ctx.arc(x, y, 1.15, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = IDLE_CENTER_COLOR
    ctx.beginPath()
    ctx.arc(cx, cy, 1.9, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  const numericDist = Math.max(0, Math.min(200, distance as number))
  const proximity = 1 - numericDist / 200
  const k = (Math.PI * 2) / style.wavelengthPx
  const [pr, pg, pb] = style.primaryRgb
  const [ar, ag, ab] = style.accentRgb
  const baseR = 51
  const baseG = 65
  const baseB = 85

  for (let row = 0; row < rows; row++) {
    const y = startY + row * step
    for (let col = 0; col < cols; col++) {
      const x = startX + col * step
      const distFromCenter = Math.hypot(x - cx, y - cy)
      const normDist = distFromCenter / maxDist
      const wave = 0.5 + 0.5 * Math.sin(distFromCenter * k - phase)
      const shaped = Math.pow(wave, 1.55)
      const reach = Math.max(0.25, 1 - normDist * (0.68 - proximity * 0.3))
      const intensity = shaped * reach

      const radius = style.minRadius + (style.maxRadius - style.minRadius) * intensity
      const mix = Math.min(1, intensity * 1.15)
      const colorMix = style.zone === 'safe' ? normDist : shaped * 0.5
      const targetR = pr + (ar - pr) * colorMix
      const targetG = pg + (ag - pg) * colorMix
      const targetB = pb + (ab - pb) * colorMix

      const red = Math.round(baseR + (targetR - baseR) * mix)
      const green = Math.round(baseG + (targetG - baseG) * mix)
      const blue = Math.round(baseB + (targetB - baseB) * mix)

      ctx.fillStyle = `rgb(${red} ${green} ${blue})`
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.fillStyle = `rgb(${ar} ${ag} ${ab})`
  ctx.beginPath()
  ctx.arc(cx, cy, style.maxRadius * 0.88, 0, Math.PI * 2)
  ctx.fill()
}

export function DistanceSonarCanvas({
  distance,
  editing,
}: {
  distance: number | null | undefined
  editing: boolean
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const sizeRef = React.useRef<{ width: number; height: number }>({ width: 0, height: 0 })
  const phaseRef = React.useRef(0.9)
  const [reducedMotion, setReducedMotion] = React.useState(false)
  const [pageHidden, setPageHidden] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(query.matches)
    sync()
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync)
      return () => query.removeEventListener('change', sync)
    }
    query.addListener(sync)
    return () => query.removeListener(sync)
  }, [])

  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const sync = () => setPageHidden(document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const effectiveDistance = editing ? null : distance
  const style = getSonarZoneStyle(effectiveDistance)
  const shouldAnimate = !editing && !reducedMotion && !pageHidden && style.zone !== 'idle'

  const renderStatic = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width, height } = sizeRef.current
    if (width <= 0 || height <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const pixelW = Math.max(1, Math.round(width * dpr))
    const pixelH = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW
      canvas.height = pixelH
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawSonarFrame(ctx, width, height, effectiveDistance, phaseRef.current)
  }, [effectiveDistance])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      sizeRef.current = { width: rect.width, height: rect.height }
      renderStatic()
    }
    updateSize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [renderStatic])

  React.useEffect(() => {
    renderStatic()
    if (!shouldAnimate) return

    let frameId = 0
    let lastTs = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - lastTs) / 1000))
      lastTs = now
      phaseRef.current = (phaseRef.current + style.speedRadPerSec * dt) % (Math.PI * 200)
      renderStatic()
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [shouldAnimate, style.speedRadPerSec, renderStatic])

  return (
    <div
      ref={containerRef}
      data-sonar-zone={style.zone}
      data-sonar-animated={shouldAnimate ? 'true' : 'false'}
      className="relative min-h-[38px] flex-1 overflow-hidden rounded-lg bg-[#0f172a]"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block size-full" />
    </div>
  )
}
