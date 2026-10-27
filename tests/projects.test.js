import assert from 'node:assert/strict';
import test from 'node:test';
import {HUBS, STORAGE_KEY, importProject, loadProjects, makeProject, saveProjects} from '../dist/projects.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('create and restore projects for both hubs', () => {
  const store = storage();
  const date = new Date('2026-10-27T10:00:00Z');
  const spike = makeProject('  Мой   SPIKE  ', 'spike', 'one', date);
  const ev3 = makeProject('EV3', 'ev3', 'two', date);
  assert.equal(spike.name, 'Мой SPIKE');
  assert.equal(HUBS[ev3.hub], 'LEGO EV3');
  assert.deepEqual(saveProjects(store, [spike, ev3]), loadProjects(store));
  assert.ok(store.getItem(STORAGE_KEY));
});

test('import gives a fresh id and preserves project contents', () => {
  const source = makeProject('Robot', 'ev3', 'original');
  source.devices = [{port:'A', type:'motor'}];
  source.workspace = {commands:[]};
  const copy = importProject(JSON.stringify(source), 'new');
  assert.equal(copy.id, 'new');
  assert.deepEqual(copy.devices, source.devices);
  assert.deepEqual(copy.workspace, source.workspace);
});

test('rejects invalid project names and unsupported hubs', () => {
  assert.throws(() => makeProject('   ', 'spike', 'x'));
  assert.throws(() => makeProject('Robot', 'unknown', 'x'));
  assert.throws(() => importProject('{"version":1,"hub":"ev3"}', 'x'));
});
