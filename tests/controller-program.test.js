import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROLLER_BUTTONS,
  BUTTON_LABELS,
  BUTTON_KEYS,
  compileControllerProgram,
  controllerHandler,
  controllerRuntimeErrors,
  describeAction,
  commandsFor,
} from '../public/controller-program.js';

test('CONTROLLER_BUTTONS defines all 10 expected buttons', () => {
  assert.equal(CONTROLLER_BUTTONS.length, 10);
  assert.deepEqual(CONTROLLER_BUTTONS, ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r']);
  for (const btn of CONTROLLER_BUTTONS) {
    assert.ok(BUTTON_LABELS[btn], `missing label for ${btn}`);
  }
  assert.equal(BUTTON_KEYS.ArrowUp, 'up');
  assert.equal(BUTTON_KEYS.KeyJ, 'a');
  assert.equal(BUTTON_KEYS.KeyQ, 'l');
});

test('compileControllerProgram rejects unsupported EV3 hub', () => {
  const project = { id: 'p1', name: 'EV3 test', hub: 'ev3', workspace: { blocks: [] } };
  const prog = compileControllerProgram(project);
  assert.equal(prog.errors.length, 1);
  assert.equal(prog.errors[0].code, 'unsupported-hub');
});

test('compileControllerProgram parses button pressed/released and simple run/stop', () => {
  const project = {
    id: 'p1',
    name: 'Robot 1',
    hub: 'spike',
    workspace: {
      blocks: [
        { id: 'b1', type: 'button', button: 'up', event: 'pressed', x: 0, y: 0 },
        { id: 'd1', type: 'drive', parentId: 'b1', motor: 'A', direction: 'forward', speed: 360, x: 0, y: 58 },
        { id: 'b2', type: 'button', button: 'up', event: 'released', x: 200, y: 0 },
        { id: 's1', type: 'stop', parentId: 'b2', motor: 'A', x: 200, y: 58 },
      ],
    },
  };
  const prog = compileControllerProgram(project);
  assert.equal(prog.errors.length, 0);
  assert.equal(prog.protocol, 2);
  assert.deepEqual(prog.ports, ['A']);
  assert.equal(prog.handlers.length, 2);

  const pressed = prog.handlers.find(h => h.button === 'up' && h.event === 'pressed');
  assert.deepEqual(controllerHandler(prog, 'up', 'pressed'), pressed);
  assert.equal(controllerHandler(prog, 'down', 'pressed'), null);
  assert.ok(pressed);
  assert.equal(pressed.actions.length, 1);
  assert.deepEqual(pressed.actions[0], { kind: 'run', port: 'A', speed: 360 });
  assert.equal(describeAction(pressed.actions[0]), 'Мотор A вперёд 360°/с');
  assert.deepEqual(commandsFor(pressed.actions[0], 2), ['m,A,360\n']);

  const released = prog.handlers.find(h => h.button === 'up' && h.event === 'released');
  assert.ok(released);
  assert.equal(released.actions.length, 1);
  assert.deepEqual(released.actions[0], { kind: 'stop', port: 'A' });
  assert.equal(describeAction(released.actions[0]), 'Стоп мотора A');
  assert.deepEqual(commandsFor(released.actions[0], 2), ['m,A,0\n']);
});

test('compileControllerProgram requires protocol 3 for angle/time/dc/high-speed', () => {
  const project = {
    id: 'p2',
    name: 'Robot 2',
    hub: 'spike',
    workspace: {
      blocks: [
        { id: 'b1', type: 'button', button: 'a', event: 'pressed', x: 0, y: 0 },
        {
          id: 'd1',
          type: 'drive',
          parentId: 'b1',
          motor: 'B',
          direction: 'backward',
          modules: ['speed', 'travel'],
          speed: 720,
          value: 2,
          unit: 'rotations',
          x: 0,
          y: 58,
        },
      ],
    },
  };
  const prog = compileControllerProgram(project);
  assert.equal(prog.errors.length, 0);
  assert.equal(prog.protocol, 3);
  assert.deepEqual(prog.ports, ['B']);
  assert.equal(prog.handlers[0].actions.length, 2);
  assert.equal(prog.handlers[0].actions[0].kind, 'angle');
  assert.equal(prog.handlers[0].actions[0].degrees, 720);
  assert.equal(prog.handlers[0].actions[0].speed, -720);
  assert.equal(prog.handlers[0].actions[1].kind, 'wait');

  assert.throws(() => commandsFor(prog.handlers[0].actions[0], 2), /протокола v3/);
  assert.deepEqual(commandsFor(prog.handlers[0].actions[0], 3), ['a,B,-720,720\n']);
});

test('compileControllerProgram detects duplicate handlers and conflicts', () => {
  const project = {
    id: 'p3',
    name: 'Robot 3',
    hub: 'spike',
    workspace: {
      blocks: [
        { id: 'b1', type: 'button', button: 'up', event: 'pressed', x: 0, y: 0 },
        { id: 'b2', type: 'button', button: 'up', event: 'pressed', x: 200, y: 0 },
        {
          id: 'pair1',
          type: 'pair',
          parentId: 'b1',
          motor: 'A',
          motor2: 'A',
          x: 0,
          y: 58,
        },
        {
          id: 'bad',
          type: 'if',
          parentId: 'b2',
          x: 200,
          y: 58,
        },
      ],
    },
  };
  const prog = compileControllerProgram(project);
  const codes = prog.errors.map(e => e.code);
  assert.ok(codes.includes('duplicate-handler'));
  assert.ok(codes.includes('same-ports'));
  assert.ok(codes.includes('bad-child'));
  assert.deepEqual(
    prog.errors.filter(error => error.code === 'duplicate-handler').map(error => error.blockId).sort(),
    ['b1', 'b2']
  );
  assert.ok(prog.errors.every(error => error.button === 'up'));
});

test('timed power brakes both motors after one shared wait', () => {
  const project = {id: 'p4', hub: 'spike', workspace: {blocks: [
    {id: 'b', type: 'button', button: 'a', event: 'pressed'},
    {id: 'p', type: 'pair', parentId: 'b', motor: 'A', motor2: 'B', modules: ['power', 'travel'], power: 50, value: 2, unit: 'seconds'},
  ]}};
  const actions = controllerHandler(compileControllerProgram(project), 'a', 'pressed').actions;
  assert.deepEqual(actions.map(action => action.kind), ['dcTime', 'dcTime', 'wait', 'stop', 'stop']);
  assert.deepEqual(actions.filter(action => action.kind === 'stop').map(action => action.port), ['A', 'B']);
  assert.deepEqual(actions.filter(action => action.kind === 'wait').map(action => action.ms), [2000]);
});

test('READY compatibility blocks only handlers requiring absent ports or v3', () => {
  const project = {id: 'p5', hub: 'spike', workspace: {blocks: [
    {id: 'b1', type: 'button', button: 'up', event: 'pressed'},
    {id: 'd1', type: 'drive', parentId: 'b1', motor: 'A'},
    {id: 'b2', type: 'button', button: 'a', event: 'pressed'},
    {id: 'd2', type: 'drive', parentId: 'b2', motor: 'B', modules: ['speed', 'travel'], speed: 360, value: 1, unit: 'rotations'},
  ]}};
  const program = compileControllerProgram(project);
  assert.deepEqual(controllerRuntimeErrors(program, 2, new Set(['A'])).map(error => error.code).sort(), ['missing-port', 'protocol-upgrade']);
  assert.ok(controllerRuntimeErrors(program, 2, new Set(['A'])).every(error => error.button === 'a'));
  assert.deepEqual(controllerRuntimeErrors(program, 3, new Set(['A', 'B'])), []);
});

test('handlers distinguish identical inputs on separate controls and report deleted targets', () => {
  const project={id:'p',hub:'spike',workspace:{controlLayout:{version:1,areas:[],controls:[{id:'one',kind:'drivetrain'},{id:'two',kind:'drivetrain'}]},blocks:[
    {id:'a',type:'button',target:{controlId:'one',input:'up'},event:'pressed'},
    {id:'a1',type:'drive',parentId:'a',motor:'A',modules:[]},
    {id:'b',type:'button',target:{controlId:'two',input:'up'},event:'pressed'},
    {id:'b1',type:'drive',parentId:'b',motor:'B',modules:[]},
  ]}};
  const result=compileControllerProgram(project);
  assert.equal(result.errors.length,0);
  assert.equal(controllerHandler(result,{controlId:'one',input:'up'},'pressed').actions[0].port,'A');
  assert.equal(controllerHandler(result,{controlId:'two',input:'up'},'pressed').actions[0].port,'B');
  project.workspace.controlLayout.controls.shift();
  const broken=compileControllerProgram(project);
  assert.equal(broken.errors.find(e=>e.code==='missing-control').blockId,'a');
  assert.ok(controllerHandler(broken,{controlId:'two',input:'up'},'pressed'));
});

test('startup compiles once and multiple startup headers block startup', () => {
  const project={id:'p',hub:'spike',workspace:{blocks:[{id:'start',type:'start'},{id:'motor',type:'drive',parentId:'start',motor:'A',modules:[]}]}};
  const compiled=compileControllerProgram(project);
  assert.deepEqual(compiled.startup,[{kind:'run',port:'A',speed:360}]);
  assert.equal(compiled.handlers.length,0);
  project.workspace.blocks.push({id:'second',type:'start'});
  const invalid=compileControllerProgram(project);
  assert.ok(invalid.errors.some(e=>e.code==='multiple-start'&&e.scope==='startup'));
  assert.deepEqual(invalid.startup,[]);
});

test('unsupported startup structure prevents a partial startup program',()=>{
  const project={id:'p',hub:'spike',workspace:{blocks:[{id:'s',type:'start'},{id:'conditional',type:'if',parentId:'s'}]}};
  const compiled=compileControllerProgram(project);
  assert.ok(compiled.errors.some(e=>e.code==='unsupported-block'&&e.scope==='startup'));
});

test('hold mode conflicts with pressed/released/hold on same button, while pressed+released stays valid', () => {
  const validLegacy = compileControllerProgram({
    id: 'p-leg', hub: 'spike',
    workspace: {
      controlLayout: { version: 1, areas: [{ id: 'a1' }], controls: [{ id: 'c1', areaId: 'a1', kind: 'motor-panel', inputs: ['blue'] }] },
      blocks: [
        { id: 'b1', type: 'button', event: 'pressed', target: { controlId: 'c1', input: 'blue' } },
        { id: 'd1', type: 'drive', parentId: 'b1', motor: 'A' },
        { id: 'b2', type: 'button', event: 'released', target: { controlId: 'c1', input: 'blue' } },
        { id: 's1', type: 'stop', parentId: 'b2', motor: 'A' },
      ],
    },
  });
  assert.equal(validLegacy.errors.length, 0);

  const conflict = compileControllerProgram({
    id: 'p-conf', hub: 'spike',
    workspace: {
      controlLayout: { version: 1, areas: [{ id: 'a1' }], controls: [{ id: 'c1', areaId: 'a1', kind: 'motor-panel', inputs: ['blue'] }] },
      blocks: [
        { id: 'b1', type: 'button', event: 'hold', target: { controlId: 'c1', input: 'blue' } },
        { id: 'd1', type: 'drive', parentId: 'b1', motor: 'A' },
        { id: 'b2', type: 'button', event: 'released', target: { controlId: 'c1', input: 'blue' } },
        { id: 's1', type: 'stop', parentId: 'b2', motor: 'A' },
      ],
    },
  });
  assert.equal(conflict.errors.filter(e => e.code === 'duplicate-handler').length, 2);
});

test('group stop compiles multi-port, detects duplicates, and stopAll avoids false missing-port errors', () => {
  const prog = compileControllerProgram({
    id: 'p-stop', hub: 'spike',
    workspace: {
      blocks: [
        { id: 'b1', type: 'button', button: 'a', event: 'pressed' },
        { id: 's1', type: 'stop', parentId: 'b1', motors: ['A', 'C', 'D'] },
        { id: 'b2', type: 'button', button: 'b', event: 'pressed' },
        { id: 's2', type: 'stop', parentId: 'b2', stopAll: true },
      ],
    },
  });
  assert.equal(prog.errors.length, 0);
  assert.deepEqual(controllerHandler(prog, 'a', 'pressed').actions, [
    { kind: 'stop', port: 'A' },
    { kind: 'stop', port: 'C' },
    { kind: 'stop', port: 'D' },
  ]);
  assert.deepEqual(controllerHandler(prog, 'b', 'pressed').actions, [{ kind: 'stopAll' }]);
  assert.deepEqual(controllerRuntimeErrors(prog, 3, new Set(['A', 'C', 'D'])), []);

  const dup = compileControllerProgram({
    id: 'p-dup', hub: 'spike',
    workspace: {
      blocks: [
        { id: 'b1', type: 'button', button: 'a', event: 'pressed' },
        { id: 's1', type: 'stop', parentId: 'b1', motors: ['B', 'B'] },
      ],
    },
  });
  assert.ok(dup.errors.some(e => e.code === 'same-ports' && e.blockId === 's1'));
});

test('chassis block requires configured chassis and compiles wheel speeds with reversals', () => {
  const unconfigured = compileControllerProgram({
    id: 'p-ch0', hub: 'spike',
    workspace: {
      blocks: [
        { id: 'b1', type: 'button', button: 'up', event: 'hold' },
        { id: 'c1', type: 'chassis', parentId: 'b1', chassisDirection: 'forward' },
      ],
    },
  });
  assert.ok(unconfigured.errors.some(e => e.code === 'chassis-unconfigured' && e.blockId === 'c1'));

  const configured = compileControllerProgram({
    id: 'p-ch1', hub: 'spike',
    workspace: {
      chassis: { leftPort: 'A', rightPort: 'B', leftReversed: false, rightReversed: true, speed: 400 },
      blocks: [
        { id: 'b1', type: 'button', button: 'up', event: 'hold' },
        { id: 'c1', type: 'chassis', parentId: 'b1', chassisDirection: 'forward' },
        { id: 'b2', type: 'button', button: 'left', event: 'hold' },
        { id: 'c2', type: 'chassis', parentId: 'b2', chassisDirection: 'left', modules: ['speed'], speed: 700 },
      ],
    },
  });
  assert.equal(configured.errors.length, 0);
  assert.equal(configured.protocol, 3);
  assert.deepEqual(controllerHandler(configured, 'up', 'hold').actions, [
    { kind: 'run', port: 'A', speed: 400 },
    { kind: 'run', port: 'B', speed: -400 },
  ]);
  assert.deepEqual(controllerHandler(configured, 'left', 'hold').actions, [
    { kind: 'run', port: 'A', speed: -700 },
    { kind: 'run', port: 'B', speed: -700 },
  ]);
});

test('compileControllerProgram discovers motor-buttons panels directly from workspace blocks', () => {
  const prog = compileControllerProgram({
    id: 'p-panel', hub: 'spike',
    workspace: {
      controlLayout: { version: 1, areas: [{ id: 'area1', sheetId: 's1', title: 'P', x: 0, y: 0, width: 400, height: 300 }], controls: [] },
      sheets: [{
        id: 's1', name: 'Main',
        blocks: [
          { id: 'panel1', type: 'motor-buttons', controlAreaId: 'area1', x: 0, y: 44, controlModules: ['red'] },
          { id: 'b1', type: 'button', event: 'hold', target: { controlId: 'panel1', input: 'red' } },
          { id: 'd1', type: 'drive', parentId: 'b1', motor: 'A' },
        ],
      }],
    },
  });
  assert.equal(prog.errors.length, 0);
});

test('workspace.chassis stays synchronized with drive-linear control area even if area.drive had stale ports', () => {
  const prog = compileControllerProgram({
    id: 'p-sync',
    hub: 'spike',
    workspace: {
      chassis: { leftPort: 'E', rightPort: 'F', leftReversed: false, rightReversed: true, speed: 420 },
      controlLayout: {
        version: 1,
        areas: [{ id: 'a1', drive: { leftPort: 'C', rightPort: 'D', leftReversed: false, rightReversed: true, speed: 360 } }],
        controls: [{ id: 'c1', areaId: 'a1', kind: 'drive-linear' }],
      },
      blocks: [
        { id: 'b1', type: 'button', event: 'hold', target: { controlId: 'c1', input: 'up' } },
        { id: 'ch1', type: 'chassis', parentId: 'b1', chassisDirection: 'forward', modules: [] },
      ],
    },
  });
  assert.equal(prog.errors.length, 0);
  const blockHandler = prog.handlers.find(h => h.sourceBlockId === 'b1');
  const downHandler = prog.handlers.find(h => h.target?.input === 'down' && h.event === 'pressed');
  assert.deepEqual(blockHandler.actions, [
    { kind: 'run', port: 'E', speed: 420 },
    { kind: 'run', port: 'F', speed: -420 },
  ]);
  assert.deepEqual(downHandler.actions, [
    { kind: 'run', port: 'E', speed: -420 },
    { kind: 'run', port: 'F', speed: 420 },
  ]);
});

test('drive block with pair module compiles both motors and flags same-ports error', () => {
  const ok = compileControllerProgram({
    id: 'p-drive-pair',
    hub: 'spike',
    workspace: {
      blocks: [
        { id: 'b1', type: 'button', button: 'a', event: 'hold' },
        { id: 'd1', type: 'drive', parentId: 'b1', motor: 'B', motor2: 'C', direction: 'forward', direction2: 'backward', modules: ['pair', 'speed'], speed: 400 },
      ],
    },
  });
  assert.equal(ok.errors.length, 0);
  assert.deepEqual(ok.ports, ['B', 'C']);
  assert.deepEqual(ok.handlers[0].actions, [
    { kind: 'run', port: 'B', speed: 400 },
    { kind: 'run', port: 'C', speed: -400 },
  ]);

  const dup = compileControllerProgram({
    id: 'p-drive-pair-dup',
    hub: 'spike',
    workspace: {
      blocks: [
        { id: 'b1', type: 'button', button: 'a', event: 'hold' },
        { id: 'd1', type: 'drive', parentId: 'b1', motor: 'C', motor2: 'C', modules: ['pair'] },
      ],
    },
  });
  assert.ok(dup.errors.some(e => e.code === 'same-ports' && e.blockId === 'd1'));
});
