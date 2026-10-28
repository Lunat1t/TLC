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
  const {updateDrive, generatePybricks} = await import('../dist/workspace.js');
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
  const {generatePybricks} = await import('../dist/workspace.js');
  const base = {...addBlock([], 'motor', 0, 0, 'drive')[0], speed:450, power:35, value:2, unit:'seconds'};
  for (const mode of ['speed','power']) {
    for (const hub of ['spike','ev3']) {
      assert.equal(generatePybricks([{...base, modules:[mode,'travel']}], hub),
        generatePybricks([{...base, modules:['travel',mode]}], hub));
    }
  }
});

test('paired motors restore both ports, directions and module order', async () => {
  const {updateDrive, generatePybricks} = await import('../dist/workspace.js');
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
  const {generatePybricks} = await import('../dist/workspace.js');
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
  const {generatePybricks} = await import('../dist/workspace.js');
  const b={...addBlock([],'pair',0,0,'pair')[0],modules:['power','travel'],power:45,value:1.5,unit:'seconds'};
  const single={...addBlock([],'single',0,100,'drive')[0],modules:['travel']};
  const code=generatePybricks([b,single],'spike');
  assert.match(code,/motor_a.dc\(45\)\n    motor_b.dc\(-45\)\n    wait\(1500\)/);
  assert.equal(code.split('motor_a = Motor').length,2);
  assert.ok(code.indexOf('motor_b.brake()') < code.indexOf('motor_a.run_angle'));
});
