import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig, validateConfig, motorSpeed, nextFreeSlot, commandFor, HUB_PORTS} from '../public/controller-model.js';

test('default layout has unique cells and valid hub ports', () => {
  const config = validateConfig(defaultConfig());
  assert.equal(config.controls.length, 2);
  assert.deepEqual(HUB_PORTS.city, ['A', 'B']);
  assert.deepEqual(nextFreeSlot(config.controls), {x: 0, y: 0});
  assert.deepEqual(config.moduleLayout.map(item => item.deviceId), config.devices.map(item => item.id));
});
test('legacy modules receive positions and invalid control block links are rejected', () => {
  const old = defaultConfig(); delete old.moduleLayout;
  const migrated = validateConfig(old);
  assert.equal(migrated.moduleLayout.length, old.devices.length);
  assert.deepEqual(migrated.devices, old.devices);
  const duplicate = defaultConfig(); duplicate.moduleLayout[1].deviceId = 'drive';
  assert.throws(() => validateConfig(duplicate), /положение блока/);
  const outside = defaultConfig(); outside.moduleLayout[0].x = 1.1;
  assert.throws(() => validateConfig(outside), /положение блока/);
  const resized = defaultConfig(); resized.moduleLayout[0].width = 320; resized.moduleLayout[0].height = 260; resized.moduleLayout[0].manual = true;
  assert.deepEqual(validateConfig(resized).moduleLayout[0], {deviceId:'drive',x:0,y:0,width:320,height:260,manual:true});
  resized.moduleLayout[0].width = 900;
  assert.throws(() => validateConfig(resized), /размер блока/);
});
test('motor speed uses each port setting and reverse direction', () => {
  const config = defaultConfig();
  config.ports.A.speed = 50;
  config.ports.D.speed = 20;
  config.ports.D.reverse = true;
  assert.equal(motorSpeed(config, 'A', 1), 300);
  assert.equal(motorSpeed(config, 'A', -1), -300);
  assert.equal(motorSpeed(config, 'D', 1), -120);
});
test('invalid layouts cannot select absent ports, overlap, or overdrive', () => {
  const config = defaultConfig();
  config.hub = 'city';
  assert.throws(() => validateConfig(config), /Порт D/);
  config.controls[1].port = 'B';
  config.controls[1].x = 0;
  assert.throws(() => validateConfig(config), /одно место/);
  config.controls[1].x = 3;
  config.ports.B.speed = 101;
  assert.throws(() => validateConfig(config), /скорость/);
  assert.throws(() => commandFor('A', 601), /Недопустимая/);
  const hostile = defaultConfig();
  hostile.hub = '__proto__';
  assert.throws(() => validateConfig(hostile), /Неизвестная/);
});
test('motor command is newline terminated and port constrained', () => {
  assert.equal(commandFor('C', -300), 'm,C,-300\n');
  assert.throws(() => commandFor('Z', 0), /Недопустимая/);
});
