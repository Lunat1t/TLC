import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileControllerProgram} from '../public/controller-program.js';
import {createControllerSession} from '../src/lib/controller-runtime.ts';

test('an editor project dispatches its own control events to the safe session',async()=>{
 const project={id:'p',hub:'spike',workspace:{controlLayout:{version:1,areas:[],controls:[{id:'drive',kind:'drivetrain'}]},blocks:[
  {id:'press',type:'button',target:{controlId:'drive',input:'up'},event:'pressed'},
  {id:'move',type:'drive',parentId:'press',motor:'A',modules:['speed'],speed:200},
  {id:'release',type:'button',target:{controlId:'drive',input:'up'},event:'released'},
  {id:'brake',type:'stop',parentId:'release',motor:'A'}]}};
 let notify;const commands=[];const transport={connect:async fn=>{notify=fn},startHub:async()=>{},write:async line=>{commands.push(line);if(line==='h\n')notify('SOCER3_READY|A');if(line==='x\n')notify('SOCER2_STOP')},disconnect:async()=>{}};
 const program=compileControllerProgram(project);assert.equal(program.errors.length,0);
 const session=createControllerSession(transport);
 await session.setViewMode('check');await session.startProgram(program);session.dispatch({controlId:'drive',input:'up'},'pressed');session.dispatch({controlId:'drive',input:'up'},'released');
 assert.deepEqual(commands,[]);assert.ok(session.getState().log.some(entry=>entry.includes('Стоп мотора A')));
 await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(program);
 session.dispatch({controlId:'drive',input:'up'},'pressed');await new Promise(resolve=>setTimeout(resolve,5));
 session.dispatch({controlId:'drive',input:'up'},'released');await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(commands.includes('m,A,200\n'));assert.ok(commands.includes('m,A,0\n'));
 await session.dispose();
});

test('keyboard blocks can be snapped after start and run in TLC without a control area', async () => {
  const {addBlock, attachChain, generatePybricks, readBlocks, snapTargetInfo} = await import('../src/lib/workspace.ts');
  const {KEYBOARD_CONTROL_ID} = await import('../public/controller-program.js');
  const {migrateControlWorkspace} = await import('../src/lib/control-workspace.ts');
  let blocks = [];
  for (const [id, type] of [['start', 'start'], ['setup', 'stop'], ['press', 'keyboard'],
    ['drive', 'drive'], ['release', 'keyboard'], ['stop', 'stop'], ['left', 'keyboard'], ['reverse', 'drive']]) {
    blocks = addBlock(blocks, id, 0, 0, type);
  }
  blocks = blocks.map(block => {
    if (block.id === 'release') return {...block, event: 'released'};
    if (block.id === 'setup') return {...block, motor: 'B'};
    if (block.id === 'left') return {...block, button: 'left'};
    if (block.id === 'reverse') return {...block, direction: 'backward'};
    return block;
  });
  blocks = attachChain(blocks, 'setup', 'start');
  assert.deepEqual(snapTargetInfo(blocks, 'press', 0, 108), {id: 'setup'});
  blocks = attachChain(blocks, 'press', 'setup');
  blocks = attachChain(blocks, 'drive', 'press');
  blocks = attachChain(blocks, 'release', 'drive');
  blocks = attachChain(blocks, 'stop', 'release');
  blocks = attachChain(blocks, 'left', 'stop');
  blocks = attachChain(blocks, 'reverse', 'left');
  const saved = structuredClone({hub: 'spike', workspace: {blocks}});
  const {project: reopened} = migrateControlWorkspace(saved);
  blocks = readBlocks(reopened.workspace);
  assert.equal(blocks.find(block => block.id === 'release').parentId, 'drive');
  assert.match(generatePybricks(blocks, 'spike'), /motor_b\.brake\(\)/);
  assert.doesNotMatch(generatePybricks(blocks, 'spike'), /motor_a/);

  const program = compileControllerProgram({
    hub: 'spike',
    workspace: {
      activeSheetId: 'main',
      sheets: [{id: 'main', blocks}, {id: 'other', blocks: [{id: 'other-start', type: 'start'}]}],
      controlLayout: {version: 1, areas: [], controls: []},
    },
  });
  assert.deepEqual(program.errors, []);
  assert.deepEqual(program.startup, [{kind: 'stop', port: 'B'}]);
  assert.deepEqual(program.handlers.map(handler => [handler.target.input, handler.event]), [
    ['up', 'pressed'], ['up', 'released'], ['left', 'pressed'],
  ]);

  let notify;
  const commands = [];
  const session = createControllerSession({
    connect: async fn => { notify = fn; },
    startHub: async () => {},
    write: async line => {
      commands.push(line);
      if (line === 'h\n') notify('SOCER3_READY|A,B');
      if (line === 'x\n') notify('SOCER2_STOP');
    },
    disconnect: async () => {},
  });
  const up = {controlId: KEYBOARD_CONTROL_ID, input: 'up'};
  const left = {controlId: KEYBOARD_CONTROL_ID, input: 'left'};
  const flush = () => new Promise(resolve => setImmediate(resolve));
  try {
    await session.setViewMode('check');
    session.dispatch(up, 'pressed');
    assert.deepEqual(commands, []);
    await session.connect();
    await session.startHub();
    await session.startProgram(program);
    await flush();

    session.dispatch(up, 'pressed');
    session.dispatch(up, 'pressed');
    await flush();
    session.dispatch(up, 'released');
    await flush();
    assert.deepEqual(commands.filter(line => line.startsWith('m,A,')), ['m,A,360\n', 'm,A,0\n']);

    session.dispatch(up, 'pressed');
    await flush();
    session.dispatch(left, 'pressed');
    await flush();
    session.dispatch(up, 'released');
    await flush();
    assert.equal(commands.filter(line => line === 'm,A,0\n').length, 1);
    session.dispatch(left, 'released');
    await flush();
    assert.equal(commands.filter(line => line === 'm,A,0\n').length, 2);

    session.dispatch(up, 'pressed');
    session.dispatch(up, 'released');
    await flush();
    assert.equal(commands.filter(line => line === 'm,A,360\n').length, 2);
    assert.equal(commands.filter(line => line === 'm,A,0\n').length, 3);
  } finally {
    await session.dispose();
  }
});
