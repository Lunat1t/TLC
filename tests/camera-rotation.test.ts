import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deviceAngle, isQuarterTurn, videoRotation } from '../src/lib/camera-rotation.ts';

test('phone position follows screen.orientation.angle convention', () => {
  assert.equal(deviceAngle(90, 0, 90), 0);
  assert.equal(deviceAngle(0, -90, 0), 90);
  assert.equal(deviceAngle(0, 90, 0), 270);
  assert.equal(deviceAngle(-90, 0, 90), 180);
});

test('flat or diagonal phone keeps the previous position', () => {
  assert.equal(deviceAngle(5, 3, 90), 90);
  assert.equal(deviceAngle(null, null, 270), 270);
  // Около 45° остаётся то положение, из которого телефон наклоняют.
  assert.equal(deviceAngle(45, -45, 0), 0);
  assert.equal(deviceAngle(45, -45, 90), 90);
});

test('video rotates only when the screen did not follow the phone', () => {
  assert.equal(videoRotation(0, 0, false), 0);
  assert.equal(videoRotation(90, 90, false), 0);
  assert.equal(videoRotation(90, 0, false), 270);
  assert.equal(videoRotation(270, 0, false), 90);
  assert.equal(videoRotation(90, 0, true), 90);
  assert.equal(videoRotation(0, -90, false), 270);
});

test('only quarter turns are accepted from the phone', () => {
  assert.ok(isQuarterTurn(270));
  for (const value of [45, -90, 360, '90', null]) assert.ok(!isQuarterTurn(value));
});

test('video layer lets clicks reach the connect and QR buttons', () => {
  const source = readFileSync(new URL('../src/components/editor/display-stream-view.tsx', import.meta.url), 'utf8');
  assert.match(source, /className="pointer-events-none absolute inset-0 \[container-type:size\]"/);
});
