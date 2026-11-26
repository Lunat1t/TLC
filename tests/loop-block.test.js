import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptsBranch, addBlock, attachChain, blockTotalHeight, conditionSlotX, generatePybricks,
  isContainerType, readBlocks, snapTargetInfo, updateDrive,
} from '../src/lib/workspace.ts';
import {compileControllerProgram, describeAction} from '../public/controller-program.js';
import {createControllerSession} from '../src/lib/controller-runtime.ts';

const sensor = (extra = {}) => ({id: 'c', type: 'sensor', x: 0, y: 0, sensorType: 'ultrasonic', sensorPort: 'C', sensorOp: 'lt', sensorDistance: 20, sensorModules: ['threshold'], ...extra});
const motor = (extra = {}) => ({id: 'm', type: 'drive', x: 28, y: 54, motor: 'A', direction: 'forward', modules: [], speed: 360, power: 50, value: 1, unit: 'rotations', ...extra});
const loopProgram = (loop, {withSensor = true, withMotor = true, motorModules = []} = {}) => readBlocks({blocks: [
  {id: 's', type: 'start', x: 0, y: 0},
  {id: 'l', type: 'loop', x: 0, y: 58, parentId: 's', ...loop},
  ...(withMotor ? [motor({parentId: 'l', branch: 'body', modules: motorModules})] : []),
  ...(withSensor ? [sensor({parentId: 'l', branch: 'condition'})] : []),
]}, 'spike');

test('a new loop repeats forever and offers "how many times" and "while sensor" as modules', () => {
  const [loop] = addBlock([], 'l', 10, 20, 'loop');
  assert.equal(loop.type, 'loop');
  assert.deepEqual(loop.modules, []);
  assert.equal(loop.times, 4);
  assert.ok(isContainerType('loop') && isContainerType('if') && !isContainerType('drive'));
});

test('reading a loop keeps only its own modules and a sane repeat count', () => {
  const read = (extra) => readBlocks({blocks: [{id: 'l', type: 'loop', x: 0, y: 0, ...extra}]})[0];
  assert.deepEqual(read({modules: ['times', 'bogus', 'speed']}).modules, ['times']);
  assert.deepEqual(read({}).modules, []);
  assert.equal(read({times: 0}).times, 4);
  assert.equal(read({times: 'abc'}).times, 4);
  assert.equal(read({times: 5000}).times, 999);
  assert.equal(read({times: 2.6}).times, 3);
});

test('slots: a loop takes a body, and a condition only with the "while" module', () => {
  const plain = {type: 'loop', modules: []};
  const waiting = {type: 'loop', modules: ['while']};
  assert.equal(acceptsBranch(plain, 'body'), true);
  assert.equal(acceptsBranch(plain, 'else'), false);
  assert.equal(acceptsBranch(plain, 'condition', 'sensor'), false);
  assert.equal(acceptsBranch(waiting, 'condition', 'sensor'), true);
  assert.equal(acceptsBranch(waiting, 'condition', 'drive'), false);
  assert.equal(acceptsBranch({type: 'if'}, 'else'), true);
  assert.equal(acceptsBranch({type: 'drive'}, 'body'), false);
  assert.ok(conditionSlotX('loop') > conditionSlotX('if'));
});

test('a sensor without the "while" module is released, and one with it stays in the slot', () => {
  const kept = loopProgram({modules: ['while']});
  assert.equal(kept.find(b => b.id === 'c').parentId, 'l');
  assert.equal(kept.find(b => b.id === 'c').branch, 'condition');
  const released = loopProgram({modules: []});
  assert.equal(released.find(b => b.id === 'c').parentId, undefined);
  assert.equal(released.find(b => b.id === 'm').branch, 'body');
});

test('turning "while" off moves the sensor next to the loop instead of losing it', () => {
  const before = loopProgram({modules: ['while']});
  const after = updateDrive(before, 'l', {modules: []}, 'spike');
  const freed = after.find(b => b.id === 'c');
  assert.equal(freed.parentId, undefined);
  assert.equal(freed.x, 280);
  assert.equal(after.find(b => b.id === 'm').parentId, 'l');
});

test('the two repeat modules exclude each other', () => {
  const [loop] = addBlock([], 'l', 0, 0, 'loop');
  const counted = updateDrive([loop], 'l', {modules: ['times']}, 'spike')[0];
  assert.deepEqual(counted.modules, ['times']);
  assert.equal(counted.times, 4);
});

test('the loop height grows with its body', () => {
  const [loop] = addBlock([], 'l', 0, 0, 'loop');
  const empty = blockTotalHeight([loop], 'l');
  assert.equal(empty, 58 + 52 + 28);
  const withBody = loopProgram({modules: []}, {withSensor: false}).filter(b => b.id !== 's');
  assert.ok(blockTotalHeight(withBody, 'l') > empty);
});

test('snapping: a block can enter the loop body, a sensor only the open condition slot', () => {
  const closed = [{id: 'l', type: 'loop', x: 100, y: 100, modules: [], times: 4}, {id: 'd', type: 'drive', x: 500, y: 500, motor: 'A', modules: []}, sensor({id: 'z', x: 500, y: 600})];
  assert.deepEqual(snapTargetInfo(closed, 'd', 128, 154), {id: 'l', branch: 'body'});
  assert.notEqual(snapTargetInfo(closed, 'z', 100 + conditionSlotX('loop'), 111)?.branch, 'condition');
  const open = closed.map(b => (b.id === 'l' ? {...b, modules: ['while']} : b));
  assert.deepEqual(snapTargetInfo(open, 'z', 100 + conditionSlotX('loop'), 111), {id: 'l', branch: 'condition'});
});

test('attaching places a block inside the loop and the sensor into its slot', () => {
  const blocks = [{id: 'l', type: 'loop', x: 100, y: 100, modules: ['while'], times: 4}, {id: 'd', type: 'drive', x: 500, y: 500, motor: 'A', modules: []}, sensor({id: 'z', x: 500, y: 600})];
  let next = attachChain(blocks, 'd', 'l', 'body');
  assert.equal(next.find(b => b.id === 'd').branch, 'body');
  assert.equal(next.find(b => b.id === 'd').x, 100 + 28);
  next = attachChain(next, 'z', 'l', 'condition');
  assert.equal(next.find(b => b.id === 'z').branch, 'condition');
  assert.equal(attachChain(blocks, 'd', 'l', 'else').find(b => b.id === 'd').branch, undefined);
});

test('export: a bare loop is "while True", a counted one is "for range", a conditional one is "while condition"', () => {
  const forever = generatePybricks(loopProgram({modules: []}, {withSensor: false, motorModules: ['travel']}), 'spike');
  assert.match(forever, /while True:\n\s+motor_a\.run_angle\(360, 360, then=Stop\.BRAKE\)\n\s+wait\(10\)/);
  const counted = generatePybricks(loopProgram({modules: ['times'], times: 3}, {withSensor: false, motorModules: ['travel']}), 'spike');
  assert.match(counted, /for _ in range\(3\):\n\s+motor_a\.run_angle/);
  assert.doesNotMatch(counted, /for _ in range\(3\):[\s\S]*wait\(10\)/);
  const conditional = generatePybricks(loopProgram({modules: ['while']}, {motorModules: ['travel']}), 'spike');
  assert.match(conditional, /while sensor_c\.distance\(\) < 200:\n\s+motor_a\.run_angle[\s\S]*wait\(10\)/);
});

test('export: an empty loop still yields so it cannot hog the hub, and a bad "while" explains itself', () => {
  const emptyLoop = readBlocks({blocks: [
    {id: 's', type: 'start', x: 0, y: 0},
    {id: 'l', type: 'loop', x: 0, y: 58, parentId: 's', modules: []},
    motor({id: 'after', parentId: 'l', x: 0, y: 200, modules: ['travel']}),
  ]}, 'spike');
  assert.match(generatePybricks(emptyLoop, 'spike'), /while True:\n\s+wait\(10\)/);
  assert.throws(() => generatePybricks(loopProgram({modules: ['while']}, {withSensor: false, motorModules: ['travel']}), 'spike'), /датчик в цикл/);
});

test('export: loops nest and can sit inside "if"', () => {
  const blocks = readBlocks({blocks: [
    {id: 's', type: 'start', x: 0, y: 0},
    {id: 'o', type: 'loop', x: 0, y: 58, parentId: 's', modules: ['times'], times: 2},
    {id: 'i', type: 'loop', x: 28, y: 112, parentId: 'o', branch: 'body', modules: ['times'], times: 5},
    motor({parentId: 'i', branch: 'body', modules: ['travel']}),
  ]}, 'spike');
  const code = generatePybricks(blocks, 'spike');
  assert.match(code, /for _ in range\(2\):\n\s+for _ in range\(5\):\n\s+motor_a/);
});

test('controller program: loop actions carry repeat count or condition and body', () => {
  const compile = (loop, opts) => compileControllerProgram({hub: 'spike', workspace: {blocks: loopProgram(loop, opts)}});
  const forever = compile({modules: []}, {withSensor: false});
  assert.deepEqual(forever.errors, []);
  assert.deepEqual(forever.startup[0], {kind: 'loop', bodyActions: [{kind: 'run', port: 'A', speed: 360}]});
  const counted = compile({modules: ['times'], times: 3}, {withSensor: false});
  assert.equal(counted.startup[0].times, 3);
  const conditional = compile({modules: ['while']});
  assert.deepEqual(conditional.startup[0].condition, {port: 'C', op: 'lt', cm: 20});
  assert.equal(describeAction(forever.startup[0]), 'Повторять всегда');
  assert.equal(describeAction(counted.startup[0]), 'Повторять ×3');
  assert.match(describeAction(conditional.startup[0]), /пока C < 20 см/);
});

test('controller program: "while" without a sensor is an error, not a silent endless loop', () => {
  const program = compileControllerProgram({hub: 'spike', workspace: {blocks: loopProgram({modules: ['while']}, {withSensor: false})}});
  assert.ok(program.errors.some(e => e.code === 'missing-sensor'));
  assert.equal(program.startup.some(a => a.kind === 'loop'), false);
});

test('controller program: loop bodies count toward the 50-action limit', () => {
  const blocks = [{id: 's', type: 'start', x: 0, y: 0}, {id: 'l', type: 'loop', x: 0, y: 58, parentId: 's', modules: []}];
  let parentId = 'l', branch = 'body';
  for (let i = 0; i < 52; i++) {
    blocks.push({id: `m${i}`, type: 'drive', x: 28, y: 100 + i, parentId, ...(branch ? {branch} : {}), motor: 'A', modules: [], speed: 360});
    parentId = `m${i}`; branch = undefined;
  }
  const program = compileControllerProgram({hub: 'spike', workspace: {blocks: readBlocks({blocks}, 'spike')}});
  assert.ok(program.errors.some(e => e.code === 'too-many-actions'));
});

// --- исполнение на тестовом транспорте ---
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function fakeTransport() {
  let onLine; const writes = [];
  return {
    writes,
    connect: async (fn) => { onLine = fn; },
    startHub: async () => {},
    write: async (line) => { writes.push(line); if (line === 'h\n') onLine('SOCER3_READY|A'); if (line === 'x\n') onLine('SOCER2_STOP'); },
    disconnect: async () => {},
  };
}
const liveProgram = (startup) => ({projectId: 'p', projectName: 'p', hub: 'spike', protocol: 3, ports: ['A'], startup, handlers: [], errors: []});
async function startLive(startup, distanceCm) {
  const t = fakeTransport(); const session = createControllerSession(t);
  await session.connect(); await session.startHub(); await session.setViewMode('check');
  if (distanceCm !== undefined) session.setSensorDistance('C', distanceCm);
  await session.startProgram(liveProgram(startup));
  return {t, session};
}
const runs = (t) => t.writes.filter(l => l === 'm,A,100\n').length;

test('runtime: a counted loop runs its body exactly that many times and then moves on', async () => {
  const {t, session} = await startLive([{kind: 'loop', times: 3, bodyActions: [{kind: 'run', port: 'A', speed: 100}]}, {kind: 'run', port: 'A', speed: 200}]);
  await wait(150);
  assert.equal(runs(t), 3);
  assert.ok(t.writes.includes('m,A,200\n'), 'после цикла программа идёт дальше');
  assert.ok(t.writes.lastIndexOf('m,A,200\n') > t.writes.lastIndexOf('m,A,100\n'));
  await session.dispose();
});

test('runtime: an endless loop keeps going until the program is stopped', async () => {
  const {t, session} = await startLive([{kind: 'loop', bodyActions: [{kind: 'run', port: 'A', speed: 100}]}]);
  await wait(100);
  const during = runs(t);
  assert.ok(during >= 3, `цикл должен повторяться, было ${during}`);
  await session.stop();
  const atStop = runs(t);
  await wait(80);
  assert.equal(runs(t), atStop, 'после «Стоп» цикл больше не пишет команды');
  await session.dispose();
});

test('runtime: a "while sensor" loop ends as soon as the condition stops being true', async () => {
  const {t, session} = await startLive([{kind: 'loop', condition: {port: 'C', op: 'lt', cm: 20}, bodyActions: [{kind: 'run', port: 'A', speed: 100}]}, {kind: 'run', port: 'A', speed: 200}], 10);
  await wait(100);
  assert.ok(runs(t) >= 2, 'пока препятствие близко, цикл повторяется');
  assert.equal(t.writes.includes('m,A,200\n'), false);
  session.setSensorDistance('C', 50);
  await wait(80);
  const after = runs(t);
  assert.ok(t.writes.includes('m,A,200\n'), 'когда условие стало ложным, программа пошла дальше');
  await wait(60);
  assert.equal(runs(t), after, 'тело больше не повторяется');
  await session.dispose();
});
