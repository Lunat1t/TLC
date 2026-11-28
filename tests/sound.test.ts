import assert from 'node:assert/strict';
import test from 'node:test';
import {encodeWav, mixToMono, normalizePeak, resample} from '../src/lib/sound/wav.ts';
import {SOUND_PRESETS, presetDuration, renderPreset} from '../src/lib/sound/presets.ts';
import {MAX_RECORDINGS, createSoundLibrary, filterSounds, memoryRecordingStore} from '../src/lib/sound/library.ts';
import {createSoundPlayer} from '../src/lib/sound/player.ts';
import {addBlock, generatePybricks, readBlocks, updateDrive} from '../src/lib/workspace.ts';
import {compileControllerProgram, describeAction} from '../public/controller-program.js';
import {createControllerSession} from '../src/lib/controller-runtime.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const idleTransport = {connect: async () => {}, startHub: async () => {}, write: async () => {}, disconnect: async () => {}};
const program = (sound: Record<string, unknown>, extra: Record<string, unknown>[] = []) => compileControllerProgram({id: 'p', hub: 'spike', workspace: {blocks: [
  {id: 's', type: 'start', x: 0, y: 0},
  {id: 'z', type: 'sound', x: 0, y: 58, parentId: 's', ...sound},
  ...extra,
]}});

test('WAV header describes the samples', () => {
  const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 8000);
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'RIFF');
  assert.equal(view.getUint32(24, true), 8000);
  assert.equal(view.getUint32(40, true), 8);
  assert.deepEqual([view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)], [32767, -32768, 32767]);
});

test('recording samples are mixed, resampled and made louder only when quiet', () => {
  assert.deepEqual([...mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])])], [0.5, 0.5]);
  assert.equal(resample(new Float32Array(44100), 44100, 22050).length, 22050);
  assert.ok(Math.abs(Math.max(...normalizePeak(new Float32Array([0.3, -0.1]))) - 0.9) < 1e-6);
  assert.deepEqual([...normalizePeak(new Float32Array([0, 0.001]))], [0, new Float32Array([0.001])[0]]);
});

test('every built-in sound renders audible samples of the declared length', () => {
  assert.equal(new Set(SOUND_PRESETS.map(p => p.id)).size, SOUND_PRESETS.length);
  for (const preset of SOUND_PRESETS) {
    const samples = renderPreset(preset);
    assert.ok(Math.abs(samples.length / 22050 - presetDuration(preset)) < 0.01, preset.id);
    assert.ok(samples.some(v => Math.abs(v) > 0.1), preset.id);
    assert.ok(samples.every(v => Number.isFinite(v) && Math.abs(v) <= 1), preset.id);
  }
});

test('library adds, renames, finds and removes recordings and tells listeners', async () => {
  let id = 0;
  const library = createSoundLibrary(memoryRecordingStore(), () => String(++id));
  let changes = 0;
  library.subscribe(() => changes++);
  const data = new ArrayBuffer(8);
  const first = await library.add({data, duration: 1, createdAt: 1});
  const second = await library.add({data, duration: 2, createdAt: 2});
  assert.deepEqual([first.id, first.name, second.name], ['rec:1', 'Запись 1', 'Запись 2']);
  assert.deepEqual((await library.recordings()).map(s => s.id), ['rec:2', 'rec:1']);
  await library.rename(first.id, '  Лай   собаки ');
  assert.equal((await library.find(first.id))?.name, 'Лай собаки');
  await library.rename(first.id, '   ');
  assert.equal((await library.find(first.id))?.name, 'Лай собаки');
  assert.deepEqual(filterSounds(await library.recordings(), 'ЛАЙ').map(s => s.id), [first.id]);
  await library.remove(first.id);
  assert.equal(await library.find(first.id), null);
  assert.equal(await library.data(first.id), null);
  assert.ok((await library.data('preset:beep'))!.byteLength > 44);
  assert.equal(changes, 5);
});

test('library refuses more than the allowed number of recordings', async () => {
  let id = 0;
  const library = createSoundLibrary(memoryRecordingStore(), () => String(++id));
  for (let i = 0; i < MAX_RECORDINGS; i++) await library.add({data: new ArrayBuffer(1), duration: 1});
  await assert.rejects(library.add({data: new ArrayBuffer(1), duration: 1}), /записей/);
});

function fakeOutput() {
  const started: {gain: number; end: () => void; stopped: boolean}[] = [];
  return {started, output: {
    unlock() {},
    async start(_data: ArrayBuffer, gain: number, end: () => void) {
      const item = {gain, end, stopped: false};
      started.push(item);
      return () => { item.stopped = true; };
    },
  }};
}

test('player repeats a sound, then resolves', async () => {
  const {started, output} = fakeOutput();
  const player = createSoundPlayer(async () => new ArrayBuffer(4), output);
  let done = false;
  void player.play({soundId: 'a', volume: 50, times: 2}).then(() => { done = true; });
  await tick();
  assert.equal(started[0].gain, 0.5);
  started[0].end(); await tick();
  assert.equal(done, false);
  started[1].end(); await tick();
  assert.equal(done, true);
  assert.equal(started.length, 2);
});

test('player stops on abort, restart and stopAll; a missing recording rejects', async () => {
  const {started, output} = fakeOutput();
  const player = createSoundPlayer(async id => id === 'gone' ? null : new ArrayBuffer(4), output);
  const abort = new AbortController();
  const a = player.play({soundId: 'a', volume: 80, times: 1}, abort.signal);
  await tick(); abort.abort(); await a;
  assert.equal(started[0].stopped, true);
  const b = player.play({soundId: 'b', volume: 80, times: 1});
  await tick();
  const again = player.play({soundId: 'b', volume: 80, times: 1});
  await b; await tick();
  assert.equal(started[1].stopped, true);
  player.stopAll(); await again;
  assert.equal(started[2].stopped, true);
  const early = player.play({soundId: 'c', volume: 80, times: 1});
  player.stopAll(); await early; await tick();
  assert.ok(started.slice(3).every(item => item.stopped));
  await assert.rejects(player.play({soundId: 'gone', volume: 80, times: 1}), /нет на этом устройстве/);
});

test('a new sound block plays a beep; modules add volume, repeats and waiting', () => {
  const [block] = addBlock([], 'z', 0, 0, 'sound');
  assert.deepEqual([block.soundId, block.modules, block.volume, block.times], ['preset:beep', [], 80, 4]);
  const read = (extra: Record<string, unknown>) => readBlocks({blocks: [{id: 'z', type: 'sound', x: 0, y: 0, ...extra}]})[0];
  assert.deepEqual(read({modules: ['volume', 'speed', 'wait']}).modules, ['volume', 'wait']);
  assert.equal(read({volume: 500}).volume, 100);
  assert.equal(read({volume: 0}).volume, 0);
  assert.equal(read({soundId: 42}).soundId, 'preset:beep');
  assert.equal(updateDrive([block], 'z', {soundId: 'rec:1'}, 'spike')[0].soundId, 'rec:1');
});

test('compiler applies sound fields only when the module is on', () => {
  assert.deepEqual(program({volume: 10, times: 9}).startup, [{kind: 'sound', soundId: 'preset:beep', volume: 80, times: 1, wait: false}]);
  const full = program({soundId: 'rec:1', modules: ['volume', 'times', 'wait'], volume: 10, times: 3});
  assert.deepEqual(full.startup, [{kind: 'sound', soundId: 'rec:1', volume: 10, times: 3, wait: true}]);
  assert.equal(describeAction(full.startup[0]), 'Звук «своя запись» ×3 до конца');
  assert.deepEqual(full.errors, []);
});

test('Pybricks export stays valid Python and does not talk about the sound on the hub', () => {
  const code = generatePybricks([
    {id: 's', type: 'start', x: 0, y: 0},
    {id: 'l', type: 'loop', x: 0, y: 58, parentId: 's', modules: ['times'], times: 2},
    {id: 'z', type: 'sound', x: 28, y: 112, parentId: 'l', branch: 'body'},
    {id: 'm', type: 'drive', x: 0, y: 300, parentId: 'l', motor: 'A', direction: 'forward', modules: ['travel'], speed: 360, value: 1, unit: 'rotations'},
  ], 'spike');
  assert.match(code, /for _ in range\(2\):\n    pass {2}# Звук играет только в пульте/);
});

test('trial mode plays sounds, waits only with the module and silences them on stop', async () => {
  const played: string[] = [];
  let release = () => {};
  let silenced = 0;
  const session = createControllerSession(idleTransport as never, undefined, {
    playSound: action => {
      played.push(action.soundId);
      return action.wait ? new Promise<void>(resolve => { release = resolve; }) : Promise.reject(new Error('Записи нет'));
    },
    stopSounds: () => { silenced++; },
  });
  await session.setViewMode('check');
  await session.startProgram(program({soundId: 'rec:missing'}, [
    {id: 'w', type: 'sound', x: 0, y: 120, parentId: 'z', soundId: 'preset:horn', modules: ['wait']},
    {id: 'n', type: 'sound', x: 0, y: 180, parentId: 'w', soundId: 'preset:jump', modules: ['wait']},
  ]) as never);
  await tick();
  assert.deepEqual(played, ['rec:missing', 'preset:horn']);
  assert.ok(session.getState().log.some(line => line.includes('Записи нет')));
  assert.equal(session.getState().program, 'trial-running');
  release(); await tick();
  assert.deepEqual(played, ['rec:missing', 'preset:horn', 'preset:jump']);
  const before = silenced;
  await session.stop();
  assert.ok(silenced > before);
});
