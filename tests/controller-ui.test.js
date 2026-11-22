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

import {
  CONTROLLER_EVENT_LABELS,
  SENSOR_LIGHT_LABELS,
  TRAVEL_UNIT_ARIA_LABELS,
  TRAVEL_UNIT_LABELS,
  computePopoverPlacement,
  describeBlockForKid,
  formatSensorLightLabel,
  formatSensorLiveBadge,
  getSensorComparisonWord,
  nextControllerEvent,
  nextSensorLight,
  nextTravelUnit,
} from '../src/lib/controller-block-ui.ts';

test('tap-chip helpers cycle units, sensor lights and button event modes cleanly', () => {
  assert.equal(nextTravelUnit('rotations'), 'degrees');
  assert.equal(nextTravelUnit('degrees'), 'seconds');
  assert.equal(nextTravelUnit('seconds'), 'rotations');
  assert.equal(TRAVEL_UNIT_LABELS[nextTravelUnit('rotations')], '°');
  assert.equal(TRAVEL_UNIT_ARIA_LABELS[nextTravelUnit('degrees')], 'секунды');

  assert.equal(nextSensorLight(100), 50);
  assert.equal(nextSensorLight(50), 25);
  assert.equal(nextSensorLight(25), -1);
  assert.equal(nextSensorLight(-1), 100);
  assert.equal(SENSOR_LIGHT_LABELS[-1], 'Выкл');
  assert.equal(formatSensorLightLabel(-1), 'Выкл');
  assert.equal(formatSensorLightLabel(50), '50%');

  assert.equal(nextControllerEvent('hold'), 'pressed');
  assert.equal(nextControllerEvent('pressed'), 'released');
  assert.equal(nextControllerEvent('released'), 'hold');
  assert.equal(CONTROLLER_EVENT_LABELS.hold, 'Пока нажата');
  assert.equal(CONTROLLER_EVENT_LABELS.pressed, 'Нажата');
  assert.equal(CONTROLLER_EVENT_LABELS.released, 'Отпущена');
});

test('formatSensorLiveBadge formats all sensor types including IMU and guards null/undefined/NaN', () => {
  assert.deepEqual(
    formatSensorLiveBadge({
      module: 'threshold',
      port: 'C',
      sensorType: 'ultrasonic',
      tiltAxis: 'pitch',
      sensorDistances: { C: 14.4 },
    }),
    { kind: 'text', text: '14 см', label: 'Текущее расстояние: 14 см', minWidthClass: 'min-w-[44px]' }
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'threshold',
      port: 'C',
      sensorType: 'ultrasonic',
      tiltAxis: 'pitch',
      sensorDistances: { C: null },
    })?.text,
    '—'
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'threshold',
      port: 'C',
      sensorType: 'ultrasonic',
      tiltAxis: 'pitch',
      sensorDistances: { C: Number.NaN },
    })?.text,
    '—'
  );

  assert.deepEqual(
    formatSensorLiveBadge({
      module: 'color',
      port: 'D',
      sensorType: 'color',
      tiltAxis: 'pitch',
      sensorTelemetry: { D: { color: 'red', reflection: 42 } },
    }),
    { kind: 'color', hex: '#ef4444', label: 'Текущий цвет: Красный', minWidthClass: 'min-w-[26px]' }
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'color',
      port: 'D',
      sensorType: 'color',
      tiltAxis: 'pitch',
      sensorTelemetry: { D: { color: 'none' } },
    })?.text,
    '∅'
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'reflection',
      port: 'D',
      sensorType: 'color',
      tiltAxis: 'pitch',
      sensorTelemetry: { D: { reflection: 42.2 } },
    })?.text,
    '42%'
  );

  assert.equal(
    formatSensorLiveBadge({
      module: 'pressed',
      port: 'E',
      sensorType: 'force',
      tiltAxis: 'pitch',
      sensorTelemetry: { E: { pressed: true, force: 3.5 } },
    })?.text,
    '●'
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'pressed',
      port: 'E',
      sensorType: 'force',
      tiltAxis: 'pitch',
      sensorTelemetry: { E: { pressed: false } },
    })?.text,
    '○'
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'force',
      port: 'E',
      sensorType: 'force',
      tiltAxis: 'pitch',
      sensorTelemetry: { E: { force: 3.5 } },
    })?.text,
    '3.5 Н'
  );

  assert.equal(
    formatSensorLiveBadge({
      module: 'heading',
      port: 'C',
      sensorType: 'imu',
      tiltAxis: 'pitch',
      sensorTelemetry: { IMU: { heading: -45, pitch: 12, roll: -8 } },
    })?.text,
    '-45°'
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'tilt',
      port: 'C',
      sensorType: 'imu',
      tiltAxis: 'pitch',
      sensorTelemetry: { IMU: { heading: 0, pitch: 12, roll: -8 } },
    })?.text,
    '12°'
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'tilt',
      port: 'C',
      sensorType: 'imu',
      tiltAxis: 'roll',
      sensorTelemetry: { IMU: { heading: 0, pitch: 12, roll: -8 } },
    })?.text,
    '-8°'
  );
  assert.equal(
    formatSensorLiveBadge({
      module: 'lights',
      port: 'C',
      sensorType: 'ultrasonic',
      tiltAxis: 'pitch',
    }),
    null
  );
});

test('controller-blocks and editor use tap-chips, icon pickers, and live telemetry badges', async () => {
  const { readFileSync } = await import('node:fs');
  const blocksSource = readFileSync(new URL('../src/components/editor/controller-blocks.tsx', import.meta.url), 'utf8');
  const editorSource = readFileSync(new URL('../src/app/editor/page.tsx', import.meta.url), 'utf8');

  // Tap-chips replaced the target selects
  assert.equal(blocksSource.includes('aria-label="Единица измерения шасси"'), false);
  assert.equal(blocksSource.includes('aria-label="Подсветка датчика"'), false);
  assert.equal(blocksSource.includes('aria-label="Режим срабатывания кнопки"'), false);
  assert.equal(editorSource.includes('aria-label="Единица измерения"'), false);

  // Updating aria-labels exist for tap-chips
  assert.ok(blocksSource.includes('aria-label={`Режим срабатывания кнопки: ${CONTROLLER_EVENT_LABELS[currentEvent]}`}'));
  assert.ok(blocksSource.includes('aria-label={`Единица измерения шасси: ${TRAVEL_UNIT_ARIA_LABELS[unit]}`}'));
  assert.ok(blocksSource.includes('aria-label={`Подсветка датчика: ${formatSensorLightLabel(light)}`}'));
  assert.ok(editorSource.includes('aria-label={`Единица измерения: ${TRAVEL_UNIT_ARIA_LABELS[block.unit || "rotations"]}`}'));

  // Ports and control selectors remain <select>
  assert.ok(blocksSource.includes('aria-label="Выбрать пульт"'));
  assert.ok(blocksSource.includes('aria-label="Выбрать кнопку пульта"'));
  assert.ok(blocksSource.includes('aria-label="Порт датчика"'));
  assert.ok(editorSource.includes('aria-label="Порт второго мотора"'));

  // Live telemetry is wired to both standalone and slotted SensorBlock
  assert.equal((editorSource.match(/liveReady=\{robotState\.transport === "ready"\}/g) || []).length, 2);
  assert.equal((editorSource.match(/sensorTelemetry=\{robotState\.sensorTelemetry\}/g) || []).length, 2);
  assert.ok(blocksSource.includes('data-live-badge={mod}'));

  // Zero × buttons on blocks/modules; deletion via toolbar, palette drop zone, and + popovers
  assert.equal(blocksSource.includes('×'), false);
  assert.equal(editorSource.includes('aria-label="Удалить блок"'), false);
  assert.equal(editorSource.includes('aria-label="Удалить кнопки моторов"'), false);
  assert.equal(editorSource.includes('aria-label="Удалить датчик из условия"'), false);
  assert.equal(editorSource.includes('aria-label="Удалить второй мотор"'), false);
  assert.equal(editorSource.includes('aria-label={`Удалить модуль ${mod}`}'), false);
  assert.ok(editorSource.includes('aria-label="Удалить выбранный блок"'));
  assert.ok(editorSource.includes('isOverPaletteDropZone'));
  assert.ok(editorSource.includes('onRemoveFromCondition'));
  assert.ok(blocksSource.includes('Убрать из условия'));

  // + menus use Check toggles and guard mandatory last items
  assert.ok(blocksSource.includes('<Check '));
  assert.ok(editorSource.includes('<Check '));
  assert.ok(blocksSource.includes('disabled={isLastPort}'));
  assert.ok(blocksSource.includes('disabled={isOnlyRemaining}'));

  // Block wrapper lifts z-index on any expanded popover; If/blocks use valid Tailwind v3 outline
  assert.ok(editorSource.includes('has-[[aria-expanded="true"]]:z-40'));
  assert.ok(editorSource.includes('outline outline-[3px] outline-[#087996] outline-offset-2'));
  assert.equal(editorSource.includes('ring-3 ring-[#087996]'), false);

  // Sensor type switcher is a single active-icon button with ChevronDown cue & popover, dark bg-black/20 capsules without double borders
  assert.ok(blocksSource.includes('aria-label={`Тип датчика: ${activeSensorOption.label}`}'));
  assert.ok(blocksSource.includes('<ChevronDown size={11}'));
  assert.equal(blocksSource.includes('bg-black/20 border border-white/25'), false);
  assert.equal(editorSource.includes('bg-black/20 border border-white/25'), false);
  assert.ok(blocksSource.includes('bg-black/20'));
  assert.ok(editorSource.includes('bg-black/20'));
  assert.equal(blocksSource.includes('border border-white/35 shadow-[inset_0_-2px_#3730a3]'), false);

  // 2-tap module deletion popovers on 36x36 module icon buttons + standalone SensorBlock action badge + SVG scenes
  assert.ok(blocksSource.includes('ModuleCapsuleIconPopover'));
  assert.ok(blocksSource.includes('Обязательный модуль'));
  assert.ok(blocksSource.includes('data-sensor-action-badge'));
  assert.ok(blocksSource.includes('UltrasonicEyesScene'));
  assert.ok(editorSource.includes('openDriveModule'));
  assert.ok(editorSource.includes('data-kid-translation="true"'));
  assert.ok(editorSource.includes('aria-label="Озвучить блок"'));

  // Mode toggle in topbar and ? Гайд ONLY inside PybricksWorkspace
  assert.ok(editorSource.includes('aria-label="Режим редактора"'));
  assert.equal(editorSource.includes('? Гайд'), false);
  const pybricksSource = readFileSync(new URL('../src/components/editor/pybricks-workspace.tsx', import.meta.url), 'utf8');
  assert.ok(pybricksSource.includes('? Гайд'));
  assert.ok(pybricksSource.includes('Из блоков'));
  assert.ok(pybricksSource.includes('Вставить'));

  // Preserved light-off dimmed styling and viewport-clamped popovers
  assert.ok(blocksSource.includes('light === -1 ? "text-white/55" : "text-amber-200"'));
  assert.ok(blocksSource.includes('bg-white/25 text-white border border-white/35'));
  assert.ok(blocksSource.includes('bottom-[calc(100%+6px)]'));
  assert.ok(editorSource.includes('bottom-[calc(100%+8px)]'));
  assert.ok(blocksSource.includes('max-h-[calc(100dvh-24px)] overflow-y-auto'));
  assert.ok(editorSource.includes('max-h-[calc(100dvh-24px)] overflow-y-auto'));
});

test('computePopoverPlacement flips upward near bottom edge and respects horizontal edges', () => {
  // Bottom-right on 812x375 landscape: opens up and aligns right
  assert.deepEqual(
    computePopoverPlacement({ left: 600, top: 270, bottom: 306 }, { width: 812, height: 375 }),
    { alignLeft: false, openUp: true }
  );
  // Top-left on 812x375: opens down and aligns left
  assert.deepEqual(
    computePopoverPlacement({ left: 40, top: 80, bottom: 116 }, { width: 812, height: 375 }),
    { alignLeft: true, openUp: false }
  );
  // Very near top with little space above and below: prefers larger side (down)
  assert.deepEqual(
    computePopoverPlacement({ left: 300, top: 40, bottom: 200 }, { width: 812, height: 375 }),
    { alignLeft: false, openUp: false }
  );
});



test('kid comparison words and block sentence translator produce clear Russian phrases', () => {
  assert.equal(getSensorComparisonWord('threshold', 'lt'), 'ближе');
  assert.equal(getSensorComparisonWord('threshold', 'gt'), 'дальше');
  assert.equal(getSensorComparisonWord('reflection', 'lt'), 'темнее');
  assert.equal(getSensorComparisonWord('reflection', 'gt'), 'светлее');
  assert.equal(getSensorComparisonWord('force', 'lt'), 'слабее');
  assert.equal(getSensorComparisonWord('force', 'gt'), 'сильнее');
  assert.equal(getSensorComparisonWord('heading', 'lt'), 'меньше');
  assert.equal(getSensorComparisonWord('tilt', 'gt'), 'больше');

  const soloSensor = {
    id: 's1',
    type: 'sensor',
    x: 0,
    y: 0,
    sensorType: 'ultrasonic',
    sensorPort: 'C',
    sensorOp: 'lt',
    sensorDistance: 15,
    sensorModules: ['threshold'],
  };
  assert.match(describeBlockForKid(soloSensor, [soloSensor]), /^Ждать:.*ближе 15 см/);

  const ifBlock = { id: 'if1', type: 'if', x: 0, y: 0 };
  const slottedSensor = { ...soloSensor, id: 's2', parentId: 'if1', branch: 'condition' };
  assert.match(describeBlockForKid(slottedSensor, [ifBlock, slottedSensor]), /^Условие:/);
  assert.match(describeBlockForKid(ifBlock, [ifBlock, slottedSensor]), /^Если .*ближе 15 см.*сделать верхние блоки/);
});
