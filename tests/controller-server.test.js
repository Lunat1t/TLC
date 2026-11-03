import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig} from '../public/controller-model.js';
import {validateControllerConfig} from '../src/lib/controller-layout.ts';

test('server accepts a valid layout and strips unexpected fields', () => {
  const raw = defaultConfig();
  raw.controls[0].unexpected = 'ignored';
  const saved = validateControllerConfig(raw);
  assert.equal(saved.hub, 'prime');
  assert.equal(saved.controls[0].unexpected, undefined);
  assert.equal(saved.moduleLayout.length, saved.devices.length);
});
test('server migrates old module config and rejects a block without a matching device', () => {
  const old = defaultConfig(); delete old.moduleLayout;
  assert.equal(validateControllerConfig(old).moduleLayout.length, old.devices.length);
  const orphan = defaultConfig(); orphan.moduleLayout[1].deviceId = 'missing';
  assert.throws(() => validateControllerConfig(orphan), /положение блока/);
  const resized = defaultConfig(); resized.moduleLayout[0].width = 320; resized.moduleLayout[0].height = 260; resized.moduleLayout[0].manual = true;
  assert.equal(validateControllerConfig(resized).moduleLayout[0].width, 320);
  resized.moduleLayout[0].height = 800;
  assert.throws(() => validateControllerConfig(resized), /размер блока/);
});
test('server rejects prototype hub names, duplicate IDs, and invalid coordinates', () => {
  const prototypeHub = defaultConfig();
  prototypeHub.hub = '__proto__';
  assert.throws(() => validateControllerConfig(prototypeHub), /Неизвестная/);
  const duplicate = defaultConfig();
  duplicate.controls[1].id = duplicate.controls[0].id;
  assert.throws(() => validateControllerConfig(duplicate), /повторяющийся/);
  const outOfBounds = defaultConfig();
  outOfBounds.controls[0].x = 4;
  assert.throws(() => validateControllerConfig(outOfBounds), /вне поля/);
});
