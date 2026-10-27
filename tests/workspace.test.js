import assert from 'node:assert/strict';
import test from 'node:test';
import {addBlock, moveBlock, readBlocks, removeBlock} from '../dist/workspace.js';

test('empty blocks keep their positions when saved and reopened', () => {
  const placed = addBlock([], 'block-1', 31.4, -18.6);
  assert.deepEqual(readBlocks({blocks: placed}), [{id:'block-1', type:'empty', x:31, y:-19}]);
  const moved = moveBlock(placed, 'block-1', 96.8, 22.3);
  assert.equal(moved[0].x, 97);
  assert.equal(moved[0].y, 22);
  assert.deepEqual(removeBlock(moved, 'block-1'), []);
});

test('invalid imported blocks are ignored', () => {
  assert.deepEqual(readBlocks({blocks:[{id:'bad',type:'empty',x:'5',y:2}]}), []);
  assert.throws(() => addBlock([], 'bad', NaN, 0));
});

test('drive blocks persist settings and generate ordered Pybricks commands for both hubs', async () => {
  const {updateDrive, generatePybricks} = await import('../dist/workspace.js');
  let blocks = addBlock([], 'first', 10, 100, 'drive');
  blocks = updateDrive(blocks, 'first', {motor:'D', direction:'backward', value:1.5, unit:'rotations'}, 'spike');
  blocks = addBlock(blocks, 'second', 10, 10, 'drive');
  blocks = updateDrive(blocks, 'second', {motor:'B', direction:'forward', value:2.5, unit:'seconds'}, 'spike');
  assert.deepEqual(readBlocks({blocks}, 'spike'), blocks);
  const code = generatePybricks(blocks, 'spike');
  assert.match(code, /from pybricks\.pupdevices import Motor/);
  assert.match(code, /motor_b\.run_time\(360, 2500, then=Stop\.BRAKE\)/);
  assert.match(code, /motor_d\.run_angle\(-360, 540, then=Stop\.BRAKE\)/);
  assert.ok(code.indexOf('motor_b.run_time') < code.indexOf('motor_d.run_angle'));
  assert.match(generatePybricks(blocks, 'ev3'), /from pybricks\.ev3devices import Motor/);
  assert.throws(() => generatePybricks([], 'spike'));
});
