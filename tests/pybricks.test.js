import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SERVICE,COMMAND_EVENT,commandBytes,parseEvent} from '../dist/pybricks-protocol.js';
import {buildProgram,configId} from '../dist/pybricks-config.js';

test('Pybricks service and stdin command use the documented profile',()=>{
  assert.equal(SERVICE,'c5f50001-8280-46da-89f4-6d8051e4aeef');
  assert.equal(COMMAND_EVENT,'c5f50002-8280-46da-89f4-6d8051e4aeef');
  assert.deepEqual([...commandBytes('h\n')],[6,104,10]);
});
test('Pybricks status and stdout notifications decode',()=>{
  assert.deepEqual(parseEvent(new DataView(Uint8Array.of(0,64,0,0,0).buffer)),{type:'status',running:true,flags:64});
  assert.equal(parseEvent(Uint8Array.of(1,65,10)).text,'A\n');
});
test('one motor program never initializes disconnected ports',()=>{
  const c={left:'A',right:null,kicker:null,leftSign:1,rightSign:1,kickerSign:1};
  const source=buildProgram(readFileSync(new URL('../dist/hub_program.py',import.meta.url),'utf8'),c);
  assert.match(source,/RIGHT_PORT = None/);
  assert.match(source,/KICKER_PORT = None/);
  assert.match(source,/CONFIG_ID = "A,-,-,1,1,1"/);
  assert.equal(configId(c),'A,-,-,1,1,1');
});
test('duplicate motor ports are rejected',()=>{
  assert.throws(()=>configId({left:'A',right:'A',kicker:null,leftSign:1,rightSign:1,kickerSign:1}),/разных портах/);
});
test('full Socer hardware selection matches the archived drive and kicker directions',()=>{
  assert.equal(configId({left:'A',right:'D',kicker:'F',leftSign:-1,rightSign:1,kickerSign:1}),
    'A,D,F,-1,1,1');
});
