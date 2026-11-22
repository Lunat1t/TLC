import assert from 'node:assert/strict';
import test from 'node:test';
import {addBlock, moveBlock, readBlocks, removeBlock} from '../src/lib/workspace.ts';

test('start blocks keep their positions when saved and reopened', () => {
  const placed = addBlock([], 'block-1', 31.4, -18.6);
  assert.deepEqual(readBlocks({blocks: placed}), [{id:'block-1', type:'start', x:31, y:-19}]);
  const moved = moveBlock(placed, 'block-1', 96.8, 22.3);
  assert.equal(moved[0].x, 97);
  assert.equal(moved[0].y, 22);
  assert.deepEqual(removeBlock(moved, 'block-1'), []);
});

test('invalid imported blocks and removed empty blocks are ignored', () => {
  assert.deepEqual(readBlocks({blocks:[{id:'bad',type:'start',x:'5',y:2},{id:'old',type:'empty',x:5,y:2}]}), []);
  assert.throws(() => addBlock([], 'bad', NaN, 0));
  assert.throws(() => addBlock([], 'old', 0, 0, 'empty'));
});

test('motor button panel persists size and allows at most three added color modules', () => {
  const panel = addBlock([], 'panel', 20, 30, 'motor-buttons');
  assert.deepEqual(panel[0], {id:'panel',type:'motor-buttons',x:20,y:30,width:180,height:132,controlModules:[],hiddenControlButtons:[]});
  const saved = readBlocks({blocks:[{...panel[0],width:222,height:176,controlModules:['red','green','yellow','blue','red']} ]});
  assert.equal(saved[0].width,222);
  assert.equal(saved[0].height,176);
  assert.deepEqual(saved[0].controlModules,['red','green','yellow']);
});

test('drive blocks persist settings and generate ordered Pybricks commands for both hubs', async () => {
  const {updateDrive, generatePybricks} = await import('../src/lib/workspace.ts');
  let blocks = addBlock([], 'first', 10, 100, 'drive');
  blocks = updateDrive(blocks, 'first', {motor:'D', direction:'backward', modules:['travel'], value:1.5, unit:'rotations'}, 'spike');
  blocks = addBlock(blocks, 'second', 10, 10, 'drive');
  blocks = updateDrive(blocks, 'second', {motor:'B', direction:'forward', modules:['travel'], value:2.5, unit:'seconds'}, 'spike');
  assert.deepEqual(readBlocks({blocks}, 'spike'), blocks);
  const code = generatePybricks(blocks, 'spike');
  assert.match(code, /from pybricks\.pupdevices import Motor/);
  assert.match(code, /motor_b\.run_time\(360, 2500, then=Stop\.BRAKE\)/);
  assert.match(code, /motor_d\.run_angle\(-360, 540, then=Stop\.BRAKE\)/);
  assert.ok(code.indexOf('motor_b.run_time') < code.indexOf('motor_d.run_angle'));
  assert.match(generatePybricks(blocks, 'ev3'), /from pybricks\.ev3devices import Motor/);
  assert.throws(() => generatePybricks([], 'spike'));
});


test('motor modules preserve settings and reject unsafe combinations', async () => {
  const {updateDrive, generatePybricks} = await import('../src/lib/workspace.ts');
  let b = addBlock([], 'motor', 0, 0, 'drive');
  assert.deepEqual(b[0].modules, []);
  assert.throws(() => generatePybricks(b, 'spike'), /остановку/);
  b = updateDrive(b, 'motor', {modules:['speed','travel'], speed:500, value:2}, 'spike');
  assert.match(generatePybricks(b,'spike'), /run_angle\(500, 720/);
  b = updateDrive(b,'motor',{modules:['power','travel'],power:40,unit:'seconds',value:3},'spike');
  assert.match(generatePybricks(b,'spike'), /dc\(40\)/);
  assert.match(generatePybricks(b,'spike'), /wait\(3000\)/);
  assert.match(generatePybricks(b,'spike'), /finally:\n    motor_a.brake/);
  assert.throws(() => generatePybricks([{...b[0],unit:'degrees'}],'spike'), /секунды/);
  assert.throws(() => generatePybricks([{...b[0],modules:['speed','power','travel']}],'spike'), /оба режима/);
});


test('parameter module order does not change motor execution', async () => {
  const {generatePybricks} = await import('../src/lib/workspace.ts');
  const base = {...addBlock([], 'motor', 0, 0, 'drive')[0], speed:450, power:35, value:2, unit:'seconds'};
  for (const mode of ['speed','power']) {
    for (const hub of ['spike','ev3']) {
      assert.equal(generatePybricks([{...base, modules:[mode,'travel']}], hub),
        generatePybricks([{...base, modules:['travel',mode]}], hub));
    }
  }
});

test('paired motors restore both ports, directions and module order', async () => {
  const {updateDrive, generatePybricks} = await import('../src/lib/workspace.ts');
  let b = addBlock([], 'pair', 10, 20, 'pair');
  b = updateDrive(b,'pair',{motor:'D',motor2:'B',direction:'backward',direction2:'forward',modules:['travel','speed'],speed:420,value:2},'spike');
  assert.deepEqual(readBlocks(JSON.parse(JSON.stringify({blocks:b}))), b);
  const code=generatePybricks(b,'spike');
  assert.match(code,/motor_d.run_angle\(-420, 720, then=Stop.BRAKE, wait=False\)/);
  assert.match(code,/motor_b.run_angle\(420, 720, then=Stop.BRAKE, wait=False\)/);
  assert.equal(code,generatePybricks([{...b[0],modules:['speed','travel']}],'spike'));
  assert.throws(()=>generatePybricks([{...b[0],motor2:'D'}],'spike'),/разных порта/);
  assert.throws(()=>generatePybricks([{...b[0],modules:[]}],'spike'),/остановку/);
  assert.throws(()=>generatePybricks([{...b[0],modules:['power','travel']}],'spike'),/секунды/);
  const ev3=readBlocks({blocks:[{...b[0],motor:'F',motor2:'E'}]},'ev3');
  assert.equal(ev3[0].motor,'A'); assert.equal(ev3[0].motor2,'B');
});

test('generated pair programs start both before waiting and brake both on failure', async () => {
  const {generatePybricks} = await import('../src/lib/workspace.ts');
  const {execFileSync} = await import('node:child_process');
  for (const hub of ['spike','ev3']) for (const unit of ['rotations','degrees','seconds']) for (const failure of [false,true]) {
    const b={...addBlock([],'pair',0,0,'pair')[0],modules:['speed','travel'],unit,value:2};
    const code=generatePybricks([b],hub);
    const harness=`import sys, types
log=[]
fail=${failure ? 'True' : 'False'}
class Motor:
    def __init__(self, port):
        self.port=port
        self.control=self
        self.checks=0
    def run_angle(self, speed, angle, then, wait):
        assert wait is False
        self.run(speed)
    def run(self, speed):
        log.append(('start',self.port,speed))
        if fail and self.port=='B': raise RuntimeError('disconnected')
    dc=run
    def done(self):
        self.checks+=1
        return self.checks >= (1 if self.port=='A' else 3)
    def brake(self): log.append(('brake',self.port))
def wait(ms):
    assert [e[1] for e in log if e[0]=='start']==['A','B']
    log.append(('wait',ms))
for name in ['pybricks','pybricks.pupdevices','pybricks.ev3devices','pybricks.parameters','pybricks.tools']:
    sys.modules[name]=types.ModuleType(name)
sys.modules['pybricks.${hub==='spike'?'pupdevices':'ev3devices'}'].Motor=Motor
sys.modules['pybricks.parameters'].Port=types.SimpleNamespace(A='A',B='B')
sys.modules['pybricks.parameters'].Stop=types.SimpleNamespace(BRAKE='brake')
sys.modules['pybricks.tools'].wait=wait
try:
    exec(${JSON.stringify(code)})
except RuntimeError:
    assert fail
else:
    assert not fail
    assert any(e[0]=='wait' for e in log)
assert [e for e in log if e[0]=='brake']==[('brake','A'),('brake','B')]
assert [e for e in log if e[0]=='start']==[('start','A',360),('start','B',-360)]
`;
    execFileSync('python3',['-c',harness]);
  }
});

test('paired power uses common time and mixed single/pair programs reuse motors', async () => {
  const {generatePybricks} = await import('../src/lib/workspace.ts');
  const b={...addBlock([],'pair',0,0,'pair')[0],modules:['power','travel'],power:45,value:1.5,unit:'seconds'};
  const single={...addBlock([],'single',0,100,'drive')[0],modules:['travel']};
  const code=generatePybricks([b,single],'spike');
  assert.match(code,/motor_a.dc\(45\)\n    motor_b.dc\(-45\)\n    wait\(1500\)/);
  assert.equal(code.split('motor_a = Motor').length,2);
  assert.ok(code.indexOf('motor_b.brake()') < code.indexOf('motor_a.run_angle'));
});

test('LEGO connections insert chains, move descendants and reconnect after deletion', async () => {
  const {attachChain,moveChain,chainIds,removeBlock,blockHeight} = await import('../src/lib/workspace.ts');
  let b=addBlock([], 'a',0,0,'drive');
  b=addBlock(b,'b',300,10,'pair'); b=addBlock(b,'c',400,20);
  b=attachChain(b,'b','a'); b=attachChain(b,'c','a');
  assert.deepEqual(chainIds(b,'a'),['a','c','b']);
  assert.equal(b.find(x=>x.id==='c').y,60);
  b=moveChain(b,'a',50,60);
  assert.ok(b.every(x=>x.x===50));
  assert.equal(b[0].y,60);
  b=removeBlock(b,'c');
  assert.equal(b.find(x=>x.id==='b').parentId,'a');
  b=moveChain(b,'b',250,300);
  assert.equal(b.find(x=>x.id==='b').parentId,undefined);
  assert.equal(b.find(x=>x.id==='a').x,50);
});

test('connections survive parameter edits; snapping and execution respect whole chains', async () => {
  const {attachChain,snapTarget,updateDrive,generatePybricks} = await import('../src/lib/workspace.ts');
  let b=addBlock([], 'a',0,0,'drive'); b=addBlock(b,'b',100,500,'drive'); b=addBlock(b,'c',400,50,'drive');
  b=updateDrive(b,'a',{modules:['travel'],motor:'A'},'spike');
  b=updateDrive(b,'b',{modules:['travel'],motor:'B'},'spike');
  b=updateDrive(b,'c',{modules:['travel'],motor:'C'},'spike');
  assert.equal(snapTarget(b,'b',10,60),'a');
  assert.equal(snapTarget(b,'b',500,500),null);
  b=attachChain(b,'b','a');
  assert.equal(snapTarget(b,'a',0,212),null);
  b=updateDrive(b,'b',{speed:500,modules:['speed','travel']},'spike');
  assert.equal(b.find(x=>x.id==='b').parentId,'a');
  const code=generatePybricks(b,'spike');
  assert.ok(code.indexOf('motor_a.run_angle')<code.indexOf('motor_b.run_angle'));
  assert.ok(code.indexOf('motor_b.run_angle')<code.indexOf('motor_c.run_angle'));
  assert.deepEqual(attachChain(b,'a','b'),b);
});

test('import sanitizes cycles, missing links, duplicate IDs and forks', async () => {
  const {executionOrder} = await import('../src/lib/workspace.ts');
  const raw=[{id:'a',parentId:'b'},{id:'b',parentId:'a'},{id:'c',parentId:'a'},{id:'d',parentId:'missing'},{id:'a'}].map(x=>({...x,type:'start',x:0,y:0}));
  const clean=readBlocks({blocks:raw});
  assert.equal(clean.length,4);
  assert.equal(new Set(executionOrder(clean).map(b=>b.id)).size,4);
  const parents=clean.filter(b=>b.parentId).map(b=>b.parentId);
  assert.equal(new Set(parents).size,parents.length);
});

test('sheets migrate legacy projects and preserve isolated blocks on export/import', async () => {
  const {readSheets,addSheet,renameSheet,deleteSheet,attachChain} = await import('../src/lib/workspace.ts');
  const {makeProject,importProject,saveProjects,loadProjects} = await import('../dist/projects.js');
  let b=addBlock([], 'a',0,0); b=addBlock(b,'b',20,300); b=attachChain(b,'b','a');
  let state=readSheets({blocks:b});
  assert.equal(state.sheets[0].name,'Основная');
  state=addSheet(state,'kicker','Кикер');
  assert.deepEqual(state.sheets[1].blocks,[]);
  state=renameSheet(state,'kicker','Захват');
  const project={...makeProject('Test','spike','project'),workspace:state};
  const restored=importProject(JSON.stringify(project),'copy');
  assert.deepEqual(readSheets(restored.workspace),state);
  const store={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};
  saveProjects(store,[project]); assert.deepEqual(loadProjects(store)[0].workspace,state);
  assert.throws(()=>renameSheet(state,'kicker','Основная'),/уже есть/);
  state=deleteSheet(state,'kicker');
  assert.equal(state.activeSheetId,'sheet-main'); assert.equal(state.sheets[0].blocks.length,2);
  assert.throws(()=>deleteSheet(state,'sheet-main'),/хотя бы один/);
});

test('sheets recover invalid active ids and limit imported views and sheet count', async () => {
  const {readSheets,addSheet,MAX_SHEETS}=await import('../src/lib/workspace.ts');
  const state=readSheets({activeSheetId:'missing',sheets:[{id:'one',name:'One',blocks:[],view:{panX:10,panY:20,zoom:20}},{id:'one',name:'duplicate'},null]});
  assert.equal(state.activeSheetId,'one'); assert.equal(state.sheets.length,1); assert.equal(state.sheets[0].view.zoom,2);
  let full=state;
  for(let i=1;i<MAX_SHEETS;i++) full=addSheet(full,String(i),'Sheet '+i);
  assert.throws(()=>addSheet(full,'too-many','Extra'),/32/);
});

test('if/else block supports empty condition, body and else branches, and Pybricks code generation', async () => {
  const {attachChain,updateDrive,generatePybricks}=await import('../src/lib/workspace.ts');
  let b=addBlock([],'start-1',0,0,'start');
  b=addBlock(b,'if-1',0,100,'if');
  b=addBlock(b,'inner-body',100,200,'drive');
  b=addBlock(b,'inner-else',100,300,'drive');
  b=addBlock(b,'after-1',200,400,'drive');
  b=updateDrive(b,'inner-body',{motor:'A',modules:['travel'],value:2,unit:'rotations'},'spike');
  b=updateDrive(b,'inner-else',{motor:'C',modules:['travel'],value:1,unit:'rotations'},'spike');
  b=updateDrive(b,'after-1',{motor:'B',modules:['travel'],value:1,unit:'seconds'},'spike');
  b=attachChain(b,'if-1','start-1');
  b=attachChain(b,'inner-body','if-1','body');
  b=attachChain(b,'inner-else','if-1','else');
  b=attachChain(b,'after-1','if-1');

  assert.equal(b.find(x=>x.id==='inner-body').branch,'body');
  assert.equal(b.find(x=>x.id==='inner-else').branch,'else');
  assert.equal(b.find(x=>x.id==='after-1').branch,undefined);

  const code=generatePybricks(b,'spike');
  assert.match(code,/if True:/);
  assert.match(code,/    motor_a\.run_angle\(360, 720, then=Stop\.BRAKE\)/);
  assert.match(code,/else:/);
  assert.match(code,/    motor_c\.run_angle\(360, 360, then=Stop\.BRAKE\)/);
  assert.match(code,/\nmotor_b\.run_time\(360, 1000, then=Stop\.BRAKE\)/);
});

test('button handlers persist while standalone stop settings remain editable', async () => {
  const {updateDrive, generatePybricks} = await import('../src/lib/workspace.ts');
  const blocks = readBlocks({blocks:[
    {id:'legacy-button',type:'button',x:0,y:0,button:'a',event:'released'},
    {id:'stop',type:'stop',x:0,y:60,motor:'A'},
  ]});
  assert.deepEqual(blocks.map(block=>block.id),['legacy-button','stop']);
  assert.equal(blocks[0].event,'released');
  assert.equal(blocks[0].button,'a');
  const updated = updateDrive(blocks,'stop',{motor:'B',motor2:'C'},'spike');
  assert.equal(updated.find(block=>block.id==='stop').motor,'B');
  assert.equal(updated.find(block=>block.id==='stop').motor2,'C');
  const code=generatePybricks(updated,'spike');
  assert.match(code,/motor_b\.brake\(\)/);
  assert.match(code,/motor_c\.brake\(\)/);
  assert.doesNotMatch(code,/motor_a/);
});

test('button events can be added and retain colored targets through JSON reload',()=>{
  const blocks=addBlock([], 'event', 0, 0, 'button');
  assert.equal(blocks[0].event,'hold');
  for (const button of ['up','down','left','right','blue','red','green','yellow']) {
    for (const event of ['hold','pressed','released']) {
      const saved={...blocks[0],button,event,target:{controlId:'panel',input:button}};
      const [restored]=readBlocks(JSON.parse(JSON.stringify({blocks:[saved]})));
      assert.equal(restored.button,button);
      assert.equal(restored.event,event);
      assert.deepEqual(restored.target,saved.target);
    }
  }
});

test('legacy button without event restores as pressed, while new button defaults to hold', () => {
  const [legacy] = readBlocks({ blocks: [{ id: 'old', type: 'button', x: 0, y: 0, button: 'a' }] });
  assert.equal(legacy.event, 'pressed');
  const created = addBlock([], 'btn-new', 0, 0, 'button');
  assert.equal(created[0].event, 'hold');
});

test('group stop supports multiple ports, stopAll, and Pybricks export', async () => {
  const { attachChain, blockHeight, generatePybricks, updateDrive } = await import('../src/lib/workspace.ts');
  assert.equal(blockHeight({ type: 'stop' }), 64);
  let blocks = addBlock([], 's1', 0, 0, 'stop');
  blocks = updateDrive(blocks, 's1', { motors: ['A', 'C', 'D'] }, 'spike');
  assert.deepEqual(blocks[0].motors, ['A', 'C', 'D']);
  const codeMulti = generatePybricks(blocks, 'spike');
  assert.match(codeMulti, /motor_a\.brake\(\)/);
  assert.match(codeMulti, /motor_c\.brake\(\)/);
  assert.match(codeMulti, /motor_d\.brake\(\)/);

  blocks = updateDrive(blocks, 's1', { stopAll: true }, 'spike');
  assert.equal(blocks[0].stopAll, true);
  const codeAll = generatePybricks(blocks, 'spike', { leftPort: 'E', rightPort: 'F', leftReversed: false, rightReversed: true, speed: 400 });
  assert.match(codeAll, /motor_e\.brake\(\)/);
  assert.match(codeAll, /motor_f\.brake\(\)/);
  let chain = addBlock([], 's_top', 0, 0, 'stop');
  chain = addBlock(chain, 'd_sub', 0, 60, 'drive');
  chain = attachChain(chain, 'd_sub', 's_top');
  assert.equal(chain.find(b => b.id === 'd_sub').y, 60);
});

test('chassis block attaches under button/start and generates Pybricks drive code', async () => {
  const { attachChain, snapTarget, updateDrive, generatePybricks } = await import('../src/lib/workspace.ts');
  let blocks = addBlock([], 'btn', 0, 0, 'button');
  blocks = addBlock(blocks, 'ch', 0, 58, 'chassis');
  assert.equal(snapTarget(blocks, 'ch', 0, 54), 'btn');
  blocks = attachChain(blocks, 'ch', 'btn');
  assert.equal(blocks.find(b => b.id === 'ch').parentId, 'btn');

  let auto = addBlock([], 'st', 0, 0, 'start');
  auto = addBlock(auto, 'ch2', 0, 58, 'chassis');
  auto = updateDrive(auto, 'ch2', { chassisDirection: 'left', modules: ['speed'], speed: 500 }, 'spike');
  auto = attachChain(auto, 'ch2', 'st');
  const code = generatePybricks(auto, 'spike', { leftPort: 'C', rightPort: 'D', leftReversed: false, rightReversed: true, speed: 300 });
  assert.match(code, /motor_c\.run\(-500\)/);
  assert.match(code, /motor_d\.run\(-500\)/);
});

test('drive block supports pair module add/remove, motor2 selection, legacy conversion, and Pybricks', async () => {
  const { generatePybricks, isPairedBlock, updateDrive } = await import('../src/lib/workspace.ts');
  let blocks = addBlock([], 'st', 0, 0, 'start');
  blocks = addBlock(blocks, 'd1', 0, 58, 'drive');
  blocks[1].parentId = 'st';

  // Enable pair module when primary motor is B -> picks motor2 = A, direction2 = backward
  blocks = updateDrive(blocks, 'd1', { motor: 'B' }, 'spike');
  blocks = updateDrive(blocks, 'd1', { modules: ['pair', 'travel'], value: 2, unit: 'rotations' }, 'spike');
  assert.equal(isPairedBlock(blocks[1]), true);
  assert.equal(blocks[1].motor2, 'A');
  assert.equal(blocks[1].direction2, 'backward');

  const restored = readBlocks({ blocks }, 'spike');
  assert.equal(isPairedBlock(restored[1]), true);
  assert.equal(restored[1].motor2, 'A');
  assert.equal(restored[1].direction2, 'backward');

  const code = generatePybricks(restored, 'spike');
  assert.match(code, /motor_b\.run_angle\(360, 720/);
  assert.match(code, /motor_a\.run_angle\(-360, 720/);

  // Same ports throw Pybricks error
  const samePort = updateDrive(restored, 'd1', { motor2: 'B' }, 'spike');
  assert.throws(() => generatePybricks(samePort, 'spike'), /разных порта/);

  // Remove pair module cleans motor2/direction2
  const unpaired = updateDrive(samePort, 'd1', { modules: ['travel'] }, 'spike');
  assert.equal(isPairedBlock(unpaired[1]), false);
  assert.equal(unpaired[1].motor2, undefined);
  assert.equal(unpaired[1].direction2, undefined);

  // Legacy 'pair' block converts cleanly back to 'drive'
  let legacy = addBlock([], 'p_leg', 0, 0, 'pair');
  assert.equal(isPairedBlock(legacy[0]), true);
  legacy = updateDrive(legacy, 'p_leg', { type: 'drive', modules: [] }, 'spike');
  assert.equal(legacy[0].type, 'drive');
  assert.equal(isPairedBlock(legacy[0]), false);
  assert.equal(legacy[0].motor2, undefined);
});


test('ultrasonic sensor block snaps into if condition slot, moves with if, and generates Pybricks code', async () => {
  const {
    addBlock,
    attachChain,
    chainIds,
    cleanLinks,
    generatePybricks,
    readBlocks,
    snapTargetInfo,
    updateDrive,
  } = await import('../src/lib/workspace.ts');

  let b = addBlock([], 'start-1', 0, 0, 'start');
  b = addBlock(b, 'if-1', 0, 100, 'if');
  b = addBlock(b, 'sen-1', 400, 100, 'sensor');
  b = addBlock(b, 'body-drive', 100, 200, 'drive');
  b = updateDrive(b, 'sen-1', { sensorPort: 'D', sensorOp: 'lt', sensorDistance: 15, sensorModules: ['threshold', 'lights'], sensorLight: 80 }, 'spike');
  b = updateDrive(b, 'body-drive', { motor: 'A', modules: ['travel'], value: 1, unit: 'seconds' }, 'spike');

  b = attachChain(b, 'if-1', 'start-1');
  const if1 = b.find(x => x.id === 'if-1');
  assert.deepEqual(snapTargetInfo(b, '__palette__', if1.x + 68, if1.y + 11, 48, 'sensor'), { id: 'if-1', branch: 'condition' });
  b = attachChain(b, 'sen-1', 'if-1', 'condition');
  b = attachChain(b, 'body-drive', 'if-1', 'body');

  const slotted = b.find(x => x.id === 'sen-1');
  assert.equal(slotted.branch, 'condition');
  assert.equal(slotted.x, 68);
  assert.equal(slotted.y, if1.y + 11);
  assert.ok(chainIds(b, 'if-1').includes('sen-1'));

  // Non-sensor blocks cannot occupy condition slot; children cannot attach under slotted sensor
  const corrupted = readBlocks({
    blocks: [
      ...b,
      { id: 'bad-child', type: 'drive', parentId: 'sen-1', x: 0, y: 0 },
      { id: 'bad-cond', type: 'drive', parentId: 'if-1', branch: 'condition', x: 0, y: 0 },
    ],
  }, 'spike');
  const cleaned = cleanLinks(corrupted);
  assert.equal(cleaned.find(x => x.id === 'bad-child').parentId, undefined);
  assert.equal(cleaned.find(x => x.id === 'bad-cond').parentId, undefined);

  const code = generatePybricks(b, 'spike');
  assert.match(code, /from pybricks\.pupdevices import Motor, UltrasonicSensor/);
  assert.match(code, /sensor_d = UltrasonicSensor\(Port\.D\)/);
  assert.match(code, /sensor_d\.lights\.on\(80\)/);
  assert.match(code, /if sensor_d\.distance\(\) < 150:/);

  // Standalone sensor waits on threshold
  let standalone = addBlock([], 's2', 0, 0, 'sensor');
  standalone = updateDrive(standalone, 's2', { sensorPort: 'C', sensorOp: 'gt', sensorDistance: 50, sensorModules: ['threshold', 'lights'], sensorLight: -1 }, 'spike');
  const soloCode = generatePybricks(standalone, 'spike');
  assert.match(soloCode, /from pybricks\.pupdevices import UltrasonicSensor/);
  assert.match(soloCode, /sensor_c\.lights\.off\(\)/);
  assert.match(soloCode, /while not \(sensor_c\.distance\(\) > 500\):\n    wait\(10\)/);
});


test('sensor type switching resets modules, imu strips reset in if slot, and Pybricks generates color/force/imu and chassis travel', async () => {
  const {
    addBlock,
    attachChain,
    generatePybricks,
    updateDrive,
  } = await import('../src/lib/workspace.ts');

  let b = addBlock([], 's1', 0, 0, 'start');
  b = addBlock(b, 'sen1', 100, 100, 'sensor');
  b = updateDrive(b, 'sen1', { sensorModules: ['threshold', 'lights'], sensorLight: 50 }, 'spike');
  assert.deepEqual(b.find(x => x.id === 'sen1').sensorModules, ['threshold', 'lights']);

  // Switching to color resets modules to ['color']
  b = updateDrive(b, 'sen1', { sensorType: 'color' }, 'spike');
  assert.deepEqual(b.find(x => x.id === 'sen1').sensorModules, ['color']);
  assert.equal(b.find(x => x.id === 'sen1').sensorPort, 'C');

  // Switching to force resets modules to ['pressed']
  b = updateDrive(b, 'sen1', { sensorType: 'force' }, 'spike');
  assert.deepEqual(b.find(x => x.id === 'sen1').sensorModules, ['pressed']);

  // Switching to imu resets modules to ['heading'] and sets port 'IMU'
  b = updateDrive(b, 'sen1', { sensorType: 'imu' }, 'spike');
  assert.deepEqual(b.find(x => x.id === 'sen1').sensorModules, ['heading']);
  assert.equal(b.find(x => x.id === 'sen1').sensorPort, 'IMU');

  // Snapping imu with only 'reset' into if condition slot strips 'reset' and falls back to ['heading']
  b = addBlock(b, 'if1', 0, 60, 'if');
  b = attachChain(b, 'if1', 's1');
  b = updateDrive(b, 'sen1', { sensorModules: ['reset'] }, 'spike');
  b = attachChain(b, 'sen1', 'if1', 'condition');
  assert.deepEqual(b.find(x => x.id === 'sen1').sensorModules, ['heading']);

  // Generate Pybricks for color, force, imu, and chassis travel
  let prog = addBlock([], 'st', 0, 0, 'start');
  prog = addBlock(prog, 'ch', 0, 60, 'chassis');
  prog = updateDrive(prog, 'ch', { chassisDirection: 'forward', modules: ['travel'], value: 2, unit: 'rotations' }, 'spike');
  prog = addBlock(prog, 'sc', 0, 120, 'sensor');
  prog = updateDrive(prog, 'sc', { sensorType: 'color', sensorPort: 'D', sensorColor: 'green', sensorModules: ['color', 'lights'], sensorLight: 75 }, 'spike');
  prog = addBlock(prog, 'sf', 0, 180, 'sensor');
  prog = updateDrive(prog, 'sf', { sensorType: 'force', sensorPort: 'E', sensorModules: ['force'], sensorOp: 'gt', sensorForce: 2.5 }, 'spike');
  prog = addBlock(prog, 'si', 0, 240, 'sensor');
  prog = updateDrive(prog, 'si', { sensorType: 'imu', sensorModules: ['reset', 'tilt'], sensorAxis: 'roll', sensorTiltOp: 'lt', sensorTilt: 15 }, 'spike');
  prog = attachChain(prog, 'ch', 'st');
  prog = attachChain(prog, 'sc', 'ch');
  prog = attachChain(prog, 'sf', 'sc');
  prog = attachChain(prog, 'si', 'sf');

  const py = generatePybricks(prog, 'spike');
  assert.match(py, /from pybricks\.hubs import PrimeHub/);
  assert.match(py, /from pybricks\.pupdevices import Motor, ColorSensor, ForceSensor/);
  assert.match(py, /from pybricks\.parameters import Color, Port, Stop/);
  assert.match(py, /motor_a\.run_angle\(360, 720, then=Stop\.BRAKE, wait=False\)/);
  assert.match(py, /sensor_d\.lights\.on\(75\)/);
  assert.match(py, /while not \(sensor_d\.color\(\) == Color\.GREEN\):/);
  assert.match(py, /while not \(sensor_e\.force\(\) > 2\.5\):/);
  assert.match(py, /hub\.imu\.reset_heading\(0\)/);
  assert.match(py, /while not \(hub\.imu\.tilt\(\)\[1\] < 15\):/);
});
