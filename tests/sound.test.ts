import assert from 'node:assert/strict';
import test from 'node:test';
import {SOUND_PRESETS, presetSeconds, soundSteps} from '../src/lib/sound/presets.ts';
import {addBlock, generatePybricks, readBlocks, updateDrive} from '../src/lib/workspace.ts';
import {compileControllerProgram, describeAction} from '../public/controller-program.js';
import {createControllerSession} from '../src/lib/controller-runtime.ts';

const program = (sound: Record<string, unknown>, extra: Record<string, unknown>[] = []) => compileControllerProgram({id: 'p', hub: 'spike', workspace: {blocks: [
  {id: 's', type: 'start', x: 0, y: 0},
  {id: 'z', type: 'sound', x: 0, y: 58, parentId: 's', ...sound},
  ...extra,
]}});

function fakeHub() {
  const writes: string[] = [];
  let onLine: (line: string) => void = () => {};
  return {writes, transport: {
    connect: async (fn: (line: string) => void) => { onLine = fn; },
    startHub: async () => {},
    write: async (line: string) => {
      writes.push(line.trim());
      if (line === 'h\n') { onLine('SOCER_VER|8'); onLine('SOCER3_READY|A'); }
      if (line === 'k\n') onLine('SOCER2_ACK');
      if (line === 'x\n') onLine('SOCER2_STOP');
    },
    disconnect: async () => {},
  }};
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const tones = (writes: string[]) => writes.filter(line => line.startsWith('n,'));

test('every sound is made of tones the hub accepts', () => {
  assert.equal(new Set(SOUND_PRESETS.map(p => p.id)).size, SOUND_PRESETS.length);
  for (const preset of SOUND_PRESETS) {
    const steps = soundSteps(preset.id);
    for (const step of steps) {
      assert.ok(step.freq === 0 || (step.freq >= 64 && step.freq <= 24000), preset.id);
      assert.ok(Number.isInteger(step.freq) && Number.isInteger(step.ms) && step.ms >= 50 && step.ms <= 5000, preset.id);
    }
    assert.ok(Math.abs(steps.reduce((sum, s) => sum + s.ms, 0) / 1000 - presetSeconds(preset)) < 0.02, preset.id);
  }
  const sweep = soundSteps('preset:laser');
  assert.deepEqual([sweep[0].freq, sweep.at(-1)!.freq], [1800, 200]);
});

test('a new sound block plays a beep; modules add volume, repeats and waiting', () => {
  const [block] = addBlock([], 'z', 0, 0, 'sound');
  assert.deepEqual([block.soundId, block.modules, block.volume, block.times], ['preset:beep', [], 80, 4]);
  const read = (extra: Record<string, unknown>) => readBlocks({blocks: [{id: 'z', type: 'sound', x: 0, y: 0, ...extra}]})[0];
  assert.deepEqual(read({modules: ['volume', 'speed', 'wait']}).modules, ['volume', 'wait']);
  assert.equal(read({volume: 500}).volume, 100);
  assert.equal(read({volume: 0}).volume, 0);
  assert.equal(read({soundId: 42}).soundId, 'preset:beep');
  assert.equal(read({soundId: 'rec:old'}).soundId, 'preset:beep');
  assert.equal(updateDrive([block], 'z', {soundId: 'preset:horn'}, 'spike')[0].soundId, 'preset:horn');
});

test('compiler applies sound fields only when the module is on', () => {
  assert.deepEqual(program({volume: 10, times: 9}).startup, [{kind: 'sound', soundId: 'preset:beep', volume: 80, times: 1, wait: false}]);
  const full = program({soundId: 'preset:horn', modules: ['volume', 'times', 'wait'], volume: 10, times: 3});
  assert.deepEqual(full.startup, [{kind: 'sound', soundId: 'preset:horn', volume: 10, times: 3, wait: true}]);
  assert.equal(describeAction(full.startup[0]), 'Звук «Гудок» ×3 до конца');
  assert.deepEqual(full.errors, []);
});

test('Pybricks export plays the sound on the SPIKE speaker and needs no motor', () => {
  const blocks = [
    {id: 's', type: 'start' as const, x: 0, y: 0},
    {id: 'z', type: 'sound' as const, x: 0, y: 58, parentId: 's', modules: ['volume' as const, 'times' as const], volume: 30, times: 2},
  ];
  const code = generatePybricks(blocks, 'spike');
  assert.match(code, /from pybricks\.hubs import PrimeHub/);
  assert.match(code, /hub = PrimeHub\(\)/);
  assert.match(code, /play_sound\(\(\(880, 250\),\), 30, 2\)/);
  assert.doesNotMatch(code, /Motor\(Port/);
  assert.match(generatePybricks(blocks, 'ev3'), /pass {2}# Звук пока играет только на SPIKE Prime/);
});

test('a running program sends the tones to the robot and ends with silence', async () => {
  const hub = fakeHub();
  const session = createControllerSession(hub.transport as never);
  await session.connect();
  await session.startHub();
  await session.setViewMode('check');
  await session.startProgram(program({soundId: 'preset:double-beep', modules: ['volume', 'wait'], volume: 40}) as never);
  await pause(600);
  assert.deepEqual(tones(hub.writes), ['n,880,220,40', 'n,0,0,40', 'n,880,220,40', 'n,0,0,0']);
  assert.ok(hub.writes.includes('k'), 'the heartbeat keeps going while a sound plays');
  await session.dispose();
});

test('stop silences a long sound and no more tones follow', async () => {
  const hub = fakeHub();
  const session = createControllerSession(hub.transport as never);
  await session.connect();
  await session.startHub();
  await session.setViewMode('check');
  await session.startProgram(program({soundId: 'preset:siren'}) as never);
  await pause(200);
  await session.stop();
  const sent = tones(hub.writes).length;
  await pause(200);
  assert.equal(tones(hub.writes).length, sent);
  assert.equal(hub.writes.at(-1), 'x');
  assert.equal(session.getState().transport, 'ready');
  await session.dispose();
});

test('preview needs a robot, plays on it and can be stopped; trial mode stays silent', async () => {
  const hub = fakeHub();
  const session = createControllerSession(hub.transport as never);
  assert.match((await session.previewSound('preset:beep', 80)).error!, /Подключите робота/);
  await session.setViewMode('check');
  await session.startProgram(program({}) as never);
  await pause(20);
  assert.deepEqual(hub.writes, []);
  await session.setViewMode('edit');
  await session.connect();
  assert.deepEqual(await session.previewSound('preset:beep', 55), {ok: true});
  assert.deepEqual(tones(hub.writes), ['n,880,350,55', 'n,0,0,0']);
  const long = session.previewSound('preset:siren', 55);
  await pause(100);
  await session.stopSound();
  assert.deepEqual(await long, {ok: true});
  assert.equal(tones(hub.writes).at(-1), 'n,0,0,0');
  await session.dispose();
});
