import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encode,decode,frame,FrameReader,crc32,tunnel,uploadStart,uploadChunk,parseInfo,SpikeSession,notificationBytes} from '../dist/spike-protocol.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/lego-vectors.json',import.meta.url)));
test('COBS and CRC match the independent official LEGO Python examples',()=>{
  for(const vector of fixture.vectors){
    const data=Uint8Array.from(vector.input);
    assert.deepEqual([...frame(data)],vector.frame);
    assert.equal(crc32(data),vector.crc);
    assert.deepEqual(decode(encode(data)),data);
  }
});
test('upload headers match official LEGO serializers',()=>{
  const source=Uint8Array.from(fixture.uploadSource);
  assert.deepEqual([...uploadStart(19,source)],fixture.uploadStart);
  assert.deepEqual([...uploadChunk(source,crc32(source))],fixture.uploadChunk);
});
test('notification parser handles every possible split point and coalesced frames',()=>{
  const messages=[Uint8Array.from([1,0,2,3,4,255]),Uint8Array.from([50,2,0,111,107])];
  const bytes=Uint8Array.from(messages.flatMap(x=>[...frame(x)]));
  for(let i=0;i<=bytes.length;i++){
    const delivered=[],reader=new FrameReader(x=>delivered.push([...x]));
    reader.push(bytes.slice(0,i));reader.push(bytes.slice(i));assert.deepEqual(delivered,messages.map(x=>[...x]));
  }
});
test('a high-priority frame interrupts and resumes a low-priority frame',()=>{
  const low=frame(Uint8Array.from([50,5,0,4,5,6,7,8]));
  const high=frame(Uint8Array.from([32,1]));
  const result=[],reader=new FrameReader(x=>result.push([...x]));
  reader.push(Uint8Array.from([...low.slice(0,3),1,...high,...low.slice(3)]));
  assert.deepEqual(result,[[32,1],[50,5,0,4,5,6,7,8]]);
});
test('malformed frames and slot inputs fail closed',()=>{
  assert.throws(()=>decode(Uint8Array.from([2])));
  assert.throws(()=>decode(Uint8Array.from([10,4])));
  assert.throws(()=>uploadStart(-1,new Uint8Array()));
  assert.throws(()=>uploadStart(20,new Uint8Array()));
  assert.throws(()=>uploadStart(1.5,new Uint8Array()));
});
function infoMessage(){
  const out=new Uint8Array(17),v=new DataView(out.buffer);out[0]=1;out[1]=1;out[5]=3;out[6]=6;
  v.setUint16(9,20,true);v.setUint16(11,512,true);v.setUint16(13,101,true);v.setUint16(15,0,true);return out;
}
test('negotiate firmware and limits from actual response fields',()=>{
  assert.equal(parseInfo(infoMessage()).firmware,'3.6.0');
  assert.equal(parseInfo(infoMessage()).chunkSize,101);
  const differentFirmware=infoMessage();differentFirmware[5]=2;assert.equal(parseInfo(differentFirmware).firmware,'2.6.0');
  const newerRpc=infoMessage();newerRpc[1]=2;assert.equal(parseInfo(newerRpc).rpc,'2.0.0');
  const wrong=infoMessage();new DataView(wrong.buffer).setUint16(11,0,true);assert.throws(()=>parseInfo(wrong),/ограничения/);
  assert.throws(()=>parseInfo(new Uint8Array(3)));
});
function mockHub({nackUpload=false,failWrite=false}={}){
  const state={messages:[],uploaded:[],active:0,maxActive:0,headerCRC:null};let session;
  const reader=new FrameReader(message=>{
    state.messages.push(message);
    let reply;
    switch(message[0]){
      case 0: reply=infoMessage();break;
      case 30: reply=new Uint8Array([31,0]);break;
      case 70: reply=new Uint8Array([71,1]);break; // Empty slot: NACK is permitted only here and for STOP.
      case 12: {
        state.headerCRC=new DataView(message.buffer,message.byteOffset,message.byteLength).getUint32(message.length-4,true);
        reply=new Uint8Array([13,nackUpload?1:0]);break;
      }
      case 16:{
        const v=new DataView(message.buffer,message.byteOffset,message.byteLength);
        const data=message.slice(7);assert.equal(v.getUint16(5,true),data.length);
        const seed=state.uploaded.length?state.uploaded.at(-1).crc:0;
        assert.equal(v.getUint32(1,true),crc32(data,seed));state.uploaded.push({data,crc:v.getUint32(1,true)});
        reply=new Uint8Array([17,0]);break;
      }
      case 50: reply=tunnel('ACK');break;
      default:throw new Error('Unexpected message');
    }
    queueMicrotask(()=>session.reader.push(frame(reply)));
  });
  session=new SpikeSession({async writeValueWithoutResponse(bytes){
    if(failWrite)throw new Error('link lost');
    state.active++;state.maxActive=Math.max(state.maxActive,state.active);
    assert.ok(bytes.length<=20);reader.push(bytes);
    await Promise.resolve();state.active--;
  }});
  return {session,state};
}
test('full stock BLE transcript: info → stop → clear selected slot → upload → start → command',async()=>{
  const {session,state}=mockHub();await session.negotiate();
  const source=Uint8Array.from({length:301},(_,i)=>(i*7)%256),progress=[];
  await session.upload(source,19,x=>progress.push(x));await session.start(19);await session.command('v,140,0,0\n');
  assert.deepEqual(state.messages.map(x=>x[0]),[0,30,70,12,16,16,16,16,30,50]);
  assert.equal(state.messages[2][1],19);assert.equal(state.messages[8][2],19);
  assert.deepEqual(state.uploaded.flatMap(x=>[...x.data]),[...source]);
  assert.equal(state.uploaded.at(-1).crc,state.headerCRC);
  assert.equal(progress.at(-1),100);assert.equal(state.maxActive,1);
  assert.ok(state.messages.every(x=>![10,20].includes(x[0])));
  session.close();
});
test('upload rejection halts before sending chunks or starting motors',async()=>{
  const {session,state}=mockHub({nackUpload:true});await session.negotiate();
  await assert.rejects(session.upload(new Uint8Array([1,2,3]),19),/отклонил/);
  assert.deepEqual(state.messages.map(x=>x[0]),[0,30,70,12]);assert.equal(session.closed,true);
});
test('firmware opcodes are rejected without a BLE write',async()=>{
  const {session,state}=mockHub();await assert.rejects(session.send(new Uint8Array([20])),/не разрешена/);
  assert.equal(state.messages.length,0);
});
test('connection failure closes and rejects request without a dangling response',async()=>{
  const {session}=mockHub({failWrite:true});await assert.rejects(session.negotiate(),/link lost/);assert.equal(session.closed,true);assert.equal(session.pending,null);
});
test('closing during a fragmented write prevents subsequent packets',async()=>{
  let writes=0,session;
  session=new SpikeSession({async writeValueWithoutResponse(){writes++;session.close();}});
  await assert.rejects(session.send(tunnel('x'.repeat(80))),/закрыто/);assert.equal(writes,1);
});

test('Bluefy uses advertised LEGO write-without-response before legacy',async()=>{
  const calls=[];let session;
  session=new SpikeSession({
    properties:{writeWithoutResponse:true},
    async writeValue(){calls.push('legacy');},
    async writeValueWithoutResponse(data){assert.ok(data instanceof Uint8Array);calls.push('modern');queueMicrotask(()=>session.receive(infoMessage()));}
  });
  await session.negotiate({preferLegacy:true,timeoutMs:10});
  assert.deepEqual(calls,['modern']);assert.equal(session.writeMethod,'writeValueWithoutResponse');session.close();
});
test('only harmless InfoRequest is retried after a missing answer',async()=>{
  const methods=[],commands=[];let session;
  const collect=(bytes,method)=>{
    const reader=new FrameReader(message=>commands.push(message[0]));reader.push(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);methods.push(method);
    if(method==='legacy')queueMicrotask(()=>session.receive(infoMessage()));
  };
  session=new SpikeSession({
    async writeValueWithoutResponse(bytes){collect(bytes,'without');},
    async writeValue(bytes){collect(bytes,'legacy');}
  });
  await session.negotiate({timeoutMs:5});
  assert.deepEqual(methods,['without','legacy']);assert.deepEqual(commands,[0,0]);
  assert.equal(session.closed,false);session.close();
});
test('all unanswered InfoRequests close after the bounded retry limit',async()=>{
  let count=0;const session=new SpikeSession({async writeValueWithoutResponse(){count++;}});
  await assert.rejects(session.negotiate({timeoutMs:5,attempts:3}),/команду 0/);
  assert.equal(count,3);assert.equal(session.closed,true);assert.equal(session.pending,null);
});
test('movement command timeouts never retry',async()=>{
  let writes=0;const session=new SpikeSession({async writeValueWithoutResponse(){writes++;}});
  await assert.rejects(session.request(new Uint8Array([30,0,19]),31,{timeoutMs:5,infoRetry:true}),/команду 30/);
  assert.equal(writes,1);assert.equal(session.closed,true);
});
test('write-only GATT characteristic can use acknowledged writes',async()=>{
  let called=false;const session=new SpikeSession({properties:{writeWithoutResponse:false,write:true},async writeValueWithResponse(){called=true;}});
  await session.command('x');assert.equal(called,true);session.close();
});

test('native notification buffers preserve DataView offsets and support ArrayBuffer',()=>{
  const bytes=new Uint8Array([9,1,2,8]);
  assert.deepEqual([...notificationBytes(new DataView(bytes.buffer,1,2))],[1,2]);
  assert.deepEqual([...notificationBytes(bytes.buffer)],[9,1,2,8]);
  assert.throws(()=>notificationBytes('not bytes'));
});

test('Bluefy undefined write property must never select acknowledged writes',async()=>{
  let unsupported=0,count=0;
  const session=new SpikeSession({properties:{writeWithoutResponse:true,write:undefined},
    async writeValue(){count++;},async writeValueWithoutResponse(){count++;},async writeValueWithResponse(){unsupported++;throw undefined;}
  });
  await assert.rejects(session.negotiate({preferLegacy:true,timeoutMs:5}),/команду 0/);
  assert.equal(unsupported,0);assert.equal(count,3);
});
test('Bluefy receives an exact ArrayBuffer and priority Info probe remains valid',async()=>{
  const seen=[];let session;
  session=new SpikeSession({async writeValue(data){
    seen.push(data);assert.ok(data instanceof ArrayBuffer);
    const reader=new FrameReader(m=>{assert.equal(m[0],0);queueMicrotask(()=>session.receive(infoMessage()));});
    reader.push(new Uint8Array(data));
  }});
  await session.negotiate({preferLegacy:true,timeoutMs:10});
  assert.deepEqual([...new Uint8Array(seen[0])],[0,0,2]);session.close();
});
test('third Bluefy probe uses only advertised writes with documented priority framing',async()=>{
  let session,count=0;
  const write=async data=>{
    count++;if(count<3)return;
    assert.ok(data instanceof Uint8Array);assert.equal(data[0],1);
    new FrameReader(m=>{assert.deepEqual([...m],[0]);queueMicrotask(()=>session.receive(infoMessage()));}).push(data);
  };
  session=new SpikeSession({properties:{writeWithoutResponse:true},writeValue:write,writeValueWithoutResponse:write});
  await session.negotiate({preferLegacy:true,timeoutMs:5});assert.equal(count,3);session.close();
});
test('native string and empty errors are preserved as readable Error objects',async()=>{
  const session=new SpikeSession({async writeValueWithoutResponse(){throw 'Native GATT failure';}});
  await assert.rejects(session.command('x'),/Native GATT failure/);
});

test('real Hub1 USB response decodes and negotiates its reported limits',()=>{
  for(const filename of ['hub1-info.json','hub1-ble-info.json']){
    const sample=JSON.parse(readFileSync(new URL('./fixtures/'+filename,import.meta.url),'utf8'));
    const bytes=Uint8Array.from(sample.frameHex.split(' '),x=>parseInt(x,16));
    const received=[];new FrameReader(message=>received.push(parseInfo(message))).push(bytes);
    assert.equal(received.length,1);
    const {source,frameHex,...expected}=sample;
    assert.deepEqual(received[0],expected);
  }
});
