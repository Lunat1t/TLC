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

test('motor-buttons panel stays interactive while checking and dispatches all four colors', async () => {
  const { readFileSync } = await import('node:fs');
  const editorSource = readFileSync(new URL('../src/app/editor/page.tsx', import.meta.url), 'utf8');
  assert.equal(editorSource.includes('<div inert={checking || undefined}>\n              {blocks.map'), false);
  assert.ok(editorSource.includes('inert={checking && !isMotorButtons ? true : undefined}'));

  const project = {
    id: 'colors',
    hub: 'spike',
    workspace: {
      controlLayout: { version: 1, areas: [{ id: 'area1', sheetId: 'main' }], controls: [] },
      sheets: [{
        id: 'main',
        blocks: [
          { id: 'panel1', type: 'motor-buttons', controlAreaId: 'area1', controlModules: ['red', 'green', 'yellow'], x: 20, y: 60 },
          { id: 'b1', type: 'button', target: { controlId: 'panel1', input: 'blue' }, event: 'hold', x: 0, y: 240 },
          { id: 'd1', type: 'drive', parentId: 'b1', motor: 'A', modules: ['speed'], speed: 250, x: 0, y: 300 },
          { id: 'b2', type: 'button', target: { controlId: 'panel1', input: 'red' }, event: 'hold', x: 220, y: 240 },
          { id: 'd2', type: 'drive', parentId: 'b2', motor: 'B', modules: ['speed'], speed: 300, x: 220, y: 300 },
          { id: 'b3', type: 'button', target: { controlId: 'panel1', input: 'green' }, event: 'hold', x: 440, y: 240 },
          { id: 'd3', type: 'drive', parentId: 'b3', motor: 'C', modules: ['speed'], speed: 350, x: 440, y: 300 },
          { id: 'b4', type: 'button', target: { controlId: 'panel1', input: 'yellow' }, event: 'hold', x: 660, y: 240 },
          { id: 'd4', type: 'drive', parentId: 'b4', motor: 'D', modules: ['speed'], speed: 400, x: 660, y: 300 },
        ],
      }],
    },
  };
  let notify;
  const commands = [];
  const transport = {
    connect: async fn => { notify = fn; },
    startHub: async () => {},
    write: async line => {
      commands.push(line);
      if (line === 'h\n') notify('SOCER3_READY|A,B,C,D');
      if (line === 'x\n') notify('SOCER2_STOP');
    },
    disconnect: async () => {},
  };
  const program = compileControllerProgram(project);
  assert.deepEqual(program.errors, []);
  const session = createControllerSession(transport);
  await session.connect();
  await session.startHub();
  await session.setViewMode('check');
  await session.startProgram(program);
  for (const [color, port, speed] of [['blue', 'A', 250], ['red', 'B', 300], ['green', 'C', 350], ['yellow', 'D', 400]]) {
    commands.length = 0;
    session.dispatch({ controlId: 'panel1', input: color }, 'pressed');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(commands.includes(`m,${port},${speed}\n`), `${color} pressed should run ${port}`);
    session.dispatch({ controlId: 'panel1', input: color }, 'released');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(commands.includes(`m,${port},0\n`), `${color} released should stop ${port}`);
  }
  await session.dispose();
});
