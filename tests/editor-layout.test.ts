import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONTROL_AREA_HEADER,
  buildKeyTargets,
  clampChassisSpeed,
  clampIntoArea,
  findAreaAt,
  findFreeControlSpot,
  inputControlsOnSheet,
  mapInputErrors,
  panelOverlapsControls,
  rectsOverlap,
  stripLegacyAreaDrive,
} from '../src/lib/editor-layout.ts'
import type { ControlArea, ControlInstance, ControlLayout } from '../src/lib/control-workspace.ts'

const area = (patch: Partial<ControlArea> = {}): ControlArea =>
  ({ id: 'a1', sheetId: 's1', title: 'Управление', x: 100, y: 100, width: 400, height: 300, ...patch }) as ControlArea
const control = (patch: Partial<ControlInstance>): ControlInstance =>
  ({ id: 'c1', areaId: 'a1', kind: 'drive-turn', label: 'L', x: 0, y: 0, width: 100, height: 60, ...patch }) as ControlInstance

test('rectangles that only touch edges do not overlap', () => {
  assert.equal(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }), false)
  assert.equal(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 10, height: 10 }), true)
})

test('area hit testing ignores the header and other sheets', () => {
  const areas = [area(), area({ id: 'a2', sheetId: 's2' })]
  assert.equal(findAreaAt(areas, 's1', { x: 200, y: 100 + CONTROL_AREA_HEADER - 1 }), undefined)
  assert.equal(findAreaAt(areas, 's1', { x: 200, y: 100 + CONTROL_AREA_HEADER })?.id, 'a1')
  assert.equal(findAreaAt(areas, 's2', { x: 200, y: 200 })?.id, 'a2')
  assert.equal(findAreaAt(areas, 's1', { x: 501, y: 200 }), undefined)
})

test('clamping keeps a panel inside the area content region', () => {
  assert.deepEqual(clampIntoArea(area(), { x: 0, y: 0, width: 180, height: 132 }), { x: 100, y: 144 })
  assert.deepEqual(clampIntoArea(area(), { x: 900, y: 900, width: 180, height: 132 }), { x: 320, y: 268 })
})

test('motor panels collide only with placeable controls of the same area', () => {
  const controls = [
    control({ x: 0, y: 0 }),
    control({ id: 'other', areaId: 'a2', x: 0, y: 0 }),
    control({ id: 'legacy', kind: 'drivetrain', x: 200, y: 0 }),
  ]
  assert.equal(panelOverlapsControls(area(), controls, { x: 150, y: 150, width: 50, height: 50 }), true)
  assert.equal(panelOverlapsControls(area(), controls, { x: 310, y: 150, width: 50, height: 50 }), false)
})

test('free spot prefers the drop location and falls back to the grid', () => {
  const target = area()
  assert.deepEqual(findFreeControlSpot(target, [], [100, 60], { x: 300, y: 250 }), { x: 150, y: 76 })
  const occupied = [{ x: 150, y: 76, width: 100, height: 60 }]
  assert.deepEqual(findFreeControlSpot(target, occupied, [100, 60], { x: 300, y: 250 }), { x: 0, y: 0 })
  const full = [{ x: 0, y: 0, width: 400, height: 256 }]
  assert.equal(findFreeControlSpot(target, full, [100, 60], { x: 300, y: 250 }), null)
})

test('only controls with inputs on the sheet count as input controls', () => {
  const areas = [area(), area({ id: 'a2', sheetId: 's2' })]
  const controls = [
    control({ id: 'turn' }),
    control({ id: 'display', kind: 'display' }),
    control({ id: 'elsewhere', areaId: 'a2' }),
    control({ id: 'panel', kind: 'motor-panel', inputs: [] }),
  ]
  assert.deepEqual(inputControlsOnSheet(controls, areas, 's1').map(c => c.id), ['turn'])
})

test('the first drive control gets default keys and duplicates are reported', () => {
  const layout: Pick<ControlLayout, 'areas' | 'controls'> = {
    areas: [area()],
    controls: [
      control({ id: 'drive', kind: 'drivetrain' }),
      control({ id: 'turn', keyBindings: { left: 'ArrowLeft' } }),
    ],
  }
  const targets = buildKeyTargets(layout, 's1')
  assert.deepEqual(targets.ArrowUp, [{ controlId: 'drive', input: 'up' }])
  assert.equal(targets.ArrowLeft.length, 2)
  assert.deepEqual(buildKeyTargets(layout, 'other'), {})

  const errors = mapInputErrors([
    { severity: 'error', message: 'Порт занят', target: { controlId: 'drive', input: 'down' } },
    { severity: 'warning', message: 'Совет', target: { controlId: 'drive', input: 'right' } },
  ], targets)
  assert.equal(errors['drive:down'], 'Порт занят')
  assert.equal(errors['drive:right'], undefined)
  assert.match(errors['turn:left'], /ArrowLeft назначена нескольким кнопкам/)
})

test('legacy area drive settings are stripped only when present', () => {
  const plain: ControlLayout = { version: 1, areas: [area()], controls: [] }
  assert.equal(stripLegacyAreaDrive(plain), undefined)
  const legacy = { ...plain, areas: [{ ...area(), drive: { leftPort: 'A' } } as unknown as ControlArea] }
  const stripped = stripLegacyAreaDrive(legacy)
  assert.ok(stripped)
  assert.equal('drive' in stripped.areas[0], false)
})

test('chassis speed is rounded into 1..1000 with a fallback', () => {
  assert.equal(clampChassisSpeed(undefined), 360)
  assert.equal(clampChassisSpeed(0), 1)
  assert.equal(clampChassisSpeed(5000), 1000)
  assert.equal(clampChassisSpeed(359.6), 360)
})
