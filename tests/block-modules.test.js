import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOCK_MODULES,
  MODULE_DEFS,
  activeModules,
  allowedModules,
  moduleAddPatch,
  moduleInfo,
  moduleMenu,
  normalizeModules,
  percentToSpeed,
  speedToPercent,
  toggleModule,
  validateModuleRules,
} from '../public/block-modules.js';
import {addBlock, generatePybricks, readBlocks, updateDrive} from '../src/lib/workspace.ts';
import {expandActionBlock} from '../public/block-registry.js';

test('every module named by a block exists in the registry', () => {
  for (const [type, config] of Object.entries(BLOCK_MODULES)) {
    for (const id of [...config.menu, ...config.legacy, ...config.required, ...config.fallback]) {
      assert.ok(MODULE_DEFS[id], `${type}: неизвестный модуль ${id}`);
    }
    for (const id of config.required) assert.ok(config.menu.includes(id), `${type}: обязательный модуль ${id} должен быть в меню`);
  }
  for (const def of Object.values(MODULE_DEFS)) {
    for (const other of def.conflicts) assert.ok(MODULE_DEFS[other].conflicts.includes(def.id), `${def.id} ↔ ${other}`);
  }
});

test('menus list the modules a block offers; legacy power stays hidden', () => {
  assert.deepEqual(moduleMenu('drive').map(m => m.id), ['pair', 'speed', 'travel']);
  assert.deepEqual(moduleMenu('chassis').map(m => m.id), ['speed', 'travel']);
  assert.ok(allowedModules('drive').includes('power'));
  assert.ok(!moduleMenu('drive').some(m => m.id === 'power'));
  assert.deepEqual(moduleMenu('start'), []);
});

test('modules are normalized per block type', () => {
  assert.deepEqual(normalizeModules('drive', undefined), ['travel']);
  assert.deepEqual(normalizeModules('chassis', undefined), []);
  assert.deepEqual(normalizeModules('drive', ['speed', 'speed', 'bogus', 'pair']), ['speed', 'pair']);
  assert.deepEqual(normalizeModules('chassis', ['pair', 'power', 'travel']), ['travel']);
  assert.deepEqual(normalizeModules('drive', []), []);
});

test('toggling removes conflicting modules and reports the new state', () => {
  assert.deepEqual(toggleModule('drive', ['power', 'travel'], 'speed'), {modules: ['travel', 'speed'], active: true});
  assert.deepEqual(toggleModule('drive', ['speed', 'travel'], 'speed'), {modules: ['travel'], active: false});
  assert.deepEqual(toggleModule('chassis', ['travel'], 'pair'), {modules: ['travel'], active: false});
});

test('adding a module fills the block fields it needs', () => {
  assert.deepEqual(moduleAddPatch('drive', 'pair', {motor: 'A'}), {motor2: 'B', direction2: 'backward'});
  assert.deepEqual(moduleAddPatch('drive', 'pair', {motor: 'B'}), {motor2: 'A', direction2: 'backward'});
  assert.deepEqual(moduleAddPatch('drive', 'speed'), {speed: 500});
  assert.deepEqual(moduleAddPatch('drive', 'power'), {unit: 'seconds'});
  assert.deepEqual(moduleAddPatch('drive', 'travel'), {});
});

test('speed is shown in percent and stored in degrees per second', () => {
  assert.equal(speedToPercent(500), 50);
  assert.equal(speedToPercent(360), 36);
  assert.equal(speedToPercent(5000), 100);
  assert.equal(speedToPercent(undefined), 36);
  assert.equal(percentToSpeed(50), 500);
  assert.equal(percentToSpeed(0), 10);
  assert.equal(percentToSpeed(250), 1000);
  assert.equal(speedToPercent(percentToSpeed(37)), 37);
});

test('active modules keep menu order, then legacy ones, and filter by placement', () => {
  assert.deepEqual(activeModules('drive', ['travel', 'speed', 'pair']).map(m => m.id), ['pair', 'speed', 'travel']);
  assert.deepEqual(activeModules('drive', ['travel', 'speed', 'pair'], 'chip').map(m => m.id), ['speed', 'travel']);
  assert.deepEqual(activeModules('drive', ['power'], 'chip').map(m => m.id), ['power']);
  assert.deepEqual(activeModules('drive', undefined), []);
});

test('the travel chip has no badge button, so it is removed through the + menu', () => {
  assert.equal(MODULE_DEFS.travel.chip.badge, false);
  assert.notEqual(MODULE_DEFS.speed.chip.badge, false);
  assert.ok(moduleMenu('drive').some(m => m.id === 'travel'));
  assert.ok(moduleMenu('chassis').some(m => m.id === 'travel'));
  assert.deepEqual(toggleModule('drive', ['speed', 'travel'], 'travel'), {modules: ['speed'], active: false});
});

test('chassis overrides the speed text but shares everything else', () => {
  assert.equal(moduleInfo('chassis', 'speed').title, 'Скорость шасси (%)');
  assert.equal(moduleInfo('drive', 'speed').title, 'Скорость (%)');
  assert.equal(moduleInfo('chassis', 'travel').title, moduleInfo('drive', 'travel').title);
  assert.equal(moduleInfo('drive', 'nope'), null);
});

test('rules: speed and power conflict; power needs seconds; export needs travel', () => {
  const codes = (type, block, target) => validateModuleRules(type, block, {target}).map(p => p.code);
  assert.deepEqual(codes('drive', {modules: ['speed', 'power', 'travel'], unit: 'seconds'}), ['speed-and-power']);
  assert.deepEqual(codes('drive', {modules: ['power', 'travel'], unit: 'degrees'}), ['power-travel']);
  assert.deepEqual(codes('drive', {modules: ['power', 'travel'], unit: 'seconds'}), []);
  assert.deepEqual(codes('drive', {modules: []}, 'runtime'), []);
  assert.deepEqual(codes('drive', {modules: []}, 'export'), ['missing-travel']);
  assert.deepEqual(codes('chassis', {modules: []}, 'export'), []);
  assert.deepEqual(codes('start', {modules: ['speed', 'power']}), []);
});

test('workspace and the controller runtime apply the same rules', () => {
  // Экспорт: тексты из реестра.
  const base = addBlock([], 'm', 0, 0, 'drive');
  assert.throws(() => generatePybricks([{...base[0], modules: []}], 'spike'), /остановку/);
  assert.throws(() => generatePybricks([{...base[0], modules: ['speed', 'power', 'travel']}], 'spike'), /оба режима/);
  assert.throws(() => generatePybricks([{...base[0], modules: ['power', 'travel'], unit: 'degrees'}], 'spike'), /секунды/);
  // Пульт: те же правила, короткие тексты.
  const ctx = {chassis: {configured: true, settings: {leftPort: 'A', rightPort: 'B', leftReversed: false, rightReversed: true}}, hub: 'spike'};
  const bad = expandActionBlock({id: 'x', type: 'drive', motor: 'A', modules: ['power', 'travel'], unit: 'degrees', value: 1, power: 50}, ctx);
  assert.ok(bad.errors.some(e => e.code === 'power-travel' && /секунды/.test(e.message)));
  const both = expandActionBlock({id: 'y', type: 'drive', motor: 'A', modules: ['speed', 'power'], speed: 300, power: 50}, ctx);
  assert.ok(both.errors.some(e => e.code === 'speed-and-power'));
  // Мотор без «Хода» на пульте едет до команды «Стоп».
  const free = expandActionBlock({id: 'z', type: 'drive', motor: 'A', modules: [], speed: 300}, ctx);
  assert.deepEqual(free.errors, []);
  assert.equal(free.actions[0].kind, 'run');
});

test('reading a project applies the registry to drive, pair and chassis blocks', () => {
  const blocks = readBlocks({blocks: [
    {id: 'a', type: 'drive', x: 0, y: 0, motor: 'A', modules: ['speed', 'speed', 'bogus']},
    {id: 'b', type: 'drive', x: 0, y: 100, motor: 'A'},
    {id: 'c', type: 'chassis', x: 0, y: 200, modules: ['travel', 'pair']},
  ]}, 'spike');
  const by = Object.fromEntries(blocks.map(b => [b.id, b]));
  assert.deepEqual(by.a.modules, ['speed']);
  assert.deepEqual(by.b.modules, ['travel']);
  assert.deepEqual(by.c.modules, ['travel']);
  const updated = updateDrive(blocks, 'a', {modules: ['speed', 'travel']}, 'spike');
  assert.deepEqual(updated.find(b => b.id === 'a').modules, ['speed', 'travel']);
});
