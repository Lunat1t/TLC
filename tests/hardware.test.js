import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_HARDWARE,validateHardware,hardwareKey,buildProgram} from '../dist/hardware.js';
const template=readFileSync(new URL('../dist/hub_program.py',import.meta.url),'utf8');
test('selected ports and directions are compiled into uploaded Python',()=>{
  const config={left:'B',right:'C',kicker:'A',sensor:'F',leftSign:1,rightSign:-1,kickerSign:-1};
  const source=new TextDecoder().decode(buildProgram(template,config));
  for(const line of ['LEFT = port.B','RIGHT = port.C','KICKER = port.A','SENSOR = port.F','LEFT_SIGN = 1','RIGHT_SIGN = -1','KICKER_SIGN = -1','CONFIG_ID = "B,C,A,F,1,-1,-1"'])assert.ok(source.includes(line),line);
});
test('duplicate ports, invalid values and injection are rejected',()=>{
  for(const change of [{right:'A'},{sensor:'D'},{kicker:'D'},{left:'X'},{left:'A;print(1)'},{leftSign:0}])assert.throws(()=>validateHardware({...DEFAULT_HARDWARE,...change}));
});
test('drive-only robot requires neither kicker nor sensor',()=>{
  const config={...DEFAULT_HARDWARE,left:'E',right:'F',kicker:null,sensor:null};
  assert.equal(hardwareKey(config),'E,F,-,-,-1,1,1');
  const source=new TextDecoder().decode(buildProgram(template,config));assert.ok(source.includes('KICKER = None'));assert.ok(source.includes('SENSOR = None'));
});
test('one-motor bench setup compiles without touching absent ports',()=>{
  const config={...DEFAULT_HARDWARE,right:null,kicker:null,sensor:null};
  assert.equal(hardwareKey(config),'A,-,-,-,-1,1,1');
  const source=new TextDecoder().decode(buildProgram(template,config));
  assert.ok(source.includes('LEFT = port.A'));
  assert.ok(source.includes('RIGHT = None'));
  assert.ok(source.includes('KICKER = None'));
  assert.ok(source.includes('SENSOR = None'));
  assert.throws(()=>validateHardware({...config,right:'A'}));
});
test('stale program templates are rejected before upload',()=>{assert.throws(()=>buildProgram('LEFT = port.A',DEFAULT_HARDWARE),/устарел/);});
