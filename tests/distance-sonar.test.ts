import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getDistanceZone, getSonarZoneStyle } from '../src/lib/distance-sonar.ts'
import { CONTROL_MIN } from '../src/lib/control-workspace.ts'

test('distance sonar zone thresholds map 0..200 and out-of-range values cleanly', () => {
  assert.equal(getDistanceZone(0), 'danger')
  assert.equal(getDistanceZone(14), 'danger')
  assert.equal(getDistanceZone(15), 'warning')
  assert.equal(getDistanceZone(45), 'warning')
  assert.equal(getDistanceZone(46), 'safe')
  assert.equal(getDistanceZone(200), 'safe')
  assert.equal(getDistanceZone(201), 'idle')
  assert.equal(getDistanceZone(-1), 'idle')
  assert.equal(getDistanceZone(null), 'idle')
  assert.equal(getDistanceZone(undefined), 'idle')
  assert.equal(getDistanceZone(Number.NaN), 'idle')

  const danger = getSonarZoneStyle(10)
  const warning = getSonarZoneStyle(30)
  const safe = getSonarZoneStyle(100)
  const idle = getSonarZoneStyle(null)

  assert.ok(danger.speedRadPerSec > warning.speedRadPerSec)
  assert.ok(warning.speedRadPerSec > safe.speedRadPerSec)
  assert.equal(idle.speedRadPerSec, 0)
  assert.deepEqual(danger.primaryRgb, [248, 113, 113])
  assert.deepEqual(warning.primaryRgb, [251, 191, 36])
  assert.deepEqual(safe.primaryRgb, [34, 211, 238])
})

test('distance-gauge keeps 160x112 CONTROL_MIN, uses GAUGE_SIZE 200x148 for new widgets, and renders sonar canvas above simulation slider', () => {
  assert.deepEqual(CONTROL_MIN['distance-gauge'], [160, 112])

  const editorSource = readFileSync(new URL('../src/app/editor/page.tsx', import.meta.url), 'utf8')
  const controlAreaSource = readFileSync(new URL('../src/components/editor/control-area.tsx', import.meta.url), 'utf8')
  const sonarSource = readFileSync(new URL('../src/components/editor/distance-sonar.tsx', import.meta.url), 'utf8')

  assert.ok(editorSource.includes('const GAUGE_SIZE = [200, 148] as const'))
  assert.ok(editorSource.includes('kind === "distance-gauge" ? GAUGE_SIZE'))

  const canvasIdx = controlAreaSource.indexOf('<DistanceSonarCanvas')
  const sliderIdx = controlAreaSource.indexOf('aria-label="Имитация расстояния"')
  assert.ok(canvasIdx !== -1 && sliderIdx !== -1 && canvasIdx < sliderIdx)
  assert.ok(controlAreaSource.includes('h-[34px]'))
  assert.ok(controlAreaSource.includes('inline-flex h-6 items-center'))
  assert.ok(controlAreaSource.includes('h-6 w-full shrink-0'))

  assert.ok(sonarSource.includes('min-h-[38px]'))
  assert.ok(sonarSource.includes('bg-[#0f172a]'))
  assert.ok(sonarSource.includes('prefers-reduced-motion: reduce'))
  assert.ok(sonarSource.includes('visibilitychange'))
  assert.ok(sonarSource.includes('ResizeObserver'))
  assert.ok(sonarSource.includes('devicePixelRatio'))
})
