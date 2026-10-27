import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticFrame,createDiagnosticReceiver,diagnosticWritePlan} from '../dist/bluetooth-diagnostic.js';
import {frame} from '../dist/spike-protocol.js';
test('isolated diagnostic cannot upload, erase, start or send motor commands',()=>{
  for(const opcode of [10,12,16,20,30,50,70])assert.throws(()=>diagnosticFrame(new Uint8Array([opcode])),/только чтение/);
  assert.deepEqual(diagnosticFrame(new Uint8Array([0])),frame(new Uint8Array([0])));
  assert.ok(diagnosticFrame(new Uint8Array([40,244,1])).length);
  assert.throws(()=>diagnosticFrame(new Uint8Array([0,1])));
});
test('diagnostic listener deduplicates one event delivered through property and listener',()=>{
  let packets=0,messages=0;const bytes=frame(new Uint8Array([41,0]));
  const event={target:{value:new DataView(bytes.buffer)}};
  const handler=createDiagnosticReceiver(()=>packets++,()=>messages++,error=>{throw new Error(error);});
  handler(event);handler(event);assert.equal(packets,1);assert.equal(messages,1);
});

test('diagnostic always probes unacknowledged writes first and covers both methods',()=>{
  const plan=diagnosticWritePlan({writeValue(){},writeValueWithoutResponse(){},writeValueWithResponse(){}});
  assert.deepEqual(plan.map(p=>p.method),Array(3).fill('writeValueWithoutResponse').concat(Array(3).fill('writeValue')));
  assert.deepEqual(plan.slice(0,3).map(p=>p.format),['Uint8Array','DataView','ArrayBuffer']);
  assert.deepEqual(diagnosticWritePlan({}),[]);
});
