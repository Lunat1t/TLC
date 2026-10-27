import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FrameReader,frame,tunnel,READY} from '../dist/spike-protocol.js';
class Element extends EventTarget {
  constructor(){super();this.disabled=false;this.checked=false;this.value='';this.textContent='';this.style={};this.children=[];this.capture=null;this.knob={style:{}};}
  dispatchEvent(event){const result=super.dispatchEvent(event);this['on'+event.type]?.(event);return result;}
  append(child){this.children.push(child);}
  click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
  querySelector(){return this.knob;}
  hasPointerCapture(id){return this.capture===id;}
  setPointerCapture(id){this.capture=id;}
  releasePointerCapture(){this.capture=null;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}
}
async function until(predicate){for(let i=0;i<1000;i++){if(predicate())return;await new Promise(r=>setTimeout(r,1));}assert.fail('UI transition timed out');}
function pointer(target,type,id,x,y){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,clientX:x,clientY:y});target.dispatchEvent(e);}
test('app integration: real interface flow, upload consent, one-stick motion, kick and stop',async()=>{
  const ids=[...readFileSync(new URL('../dist/controller.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const doc=new EventTarget();doc.getElementById=id=>{assert.ok(elements[id],`Unknown UI id ${id}`);return elements[id];};doc.createElement=()=>new Element();doc.hidden=false;
  const win=new EventTarget();win.isSecureContext=true;
  let timerFn;const originalInterval=globalThis.setInterval;
  const previous=new Map();
  function global(key,value){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  const messages=[],tx=new Element(),device=new EventTarget();device.name='Test SPIKE';
  let rx;
  const send=message=>{const bytes=frame(message);tx.value=new DataView(bytes.buffer);tx.dispatchEvent(new Event('characteristicvaluechanged'));};
  const peer=new FrameReader(message=>{
    messages.push(message);
    queueMicrotask(()=>{
      if(message[0]===0){const m=new Uint8Array(17),v=new DataView(m.buffer);m[0]=1;m[1]=2;m[5]=1;m[6]=6;v.setUint16(9,20,true);v.setUint16(11,512,true);v.setUint16(13,480,true);send(m);}
      else if(message[0]===70)send(new Uint8Array([71,0]));
      else if(message[0]===12)send(new Uint8Array([13,0]));
      else if(message[0]===16)send(new Uint8Array([17,0]));
      else if(message[0]===30){send(new Uint8Array([31,0]));send(new Uint8Array([32,message[1]]));if(message[1]===0)send(tunnel(READY+'|A,D,F,E,-1,1,1'));}
      else if(message[0]===50){const text=new TextDecoder().decode(message.slice(3)).trim();send(tunnel(text==='h'?READY+'|A,D,F,E,-1,1,1':'ACK'));}
    });
  });
  rx={async writeValueWithoutResponse(bytes){peer.push(bytes);}};
  tx.startNotifications=async()=>{};
  device.gatt={connected:false,async connect(){this.connected=true;return {async getPrimaryService(){return {async getCharacteristic(uuid){return uuid.includes('-0001-')?rx:tx;}};}};},disconnect(){this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
  global('document',doc);global('window',win);global('screen',{orientation:new EventTarget()});
  global('navigator',{bluetooth:{async requestDevice(){return device;}}});
  global('fetch',async()=>{const data=readFileSync(new URL('../dist/hub_program.py',import.meta.url));return {ok:true,async arrayBuffer(){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}};});
  global('setInterval',fn=>{timerFn=fn;return 1;});
  try{
    await import('../dist/app.js');globalThis.setInterval=originalInterval;
    assert.equal(elements.arm.disabled,true);assert.equal(elements.kick.disabled,true);
    assert.equal(elements.slot.children.length,20);assert.equal(elements.slot.value,'19');
    elements.connect.click();await until(()=>elements.status.textContent==='LEGO подключён').catch(e=>{throw new Error(e.message+' status='+elements.status.textContent+' messages='+messages.map(x=>x[0]));});
    assert.deepEqual(messages.map(x=>x[0]),[0]);
    elements.uploadProgram.click();assert.equal(messages.length,1,'No consent, no upload');
    elements.replaceSlot.checked=true;elements.replaceSlot.dispatchEvent(new Event('change'));
    elements.uploadProgram.click();await until(()=>elements.status.textContent==='Хаб готов' && !elements.arm.disabled).catch(e=>{throw new Error(e.message+' status='+elements.status.textContent+' setup='+elements.setupStatus.textContent+' messages='+messages.map(x=>x[0]));});
    assert.equal(elements.uploadProgress.value,100);assert.equal(elements.replaceSlot.checked,false);
    assert.equal(messages.find(x=>x[0]===70)[1],19);
    assert.ok(messages.some(x=>x[0]===16));assert.equal(elements.kick.disabled,true);
    const uploaded=Buffer.concat(messages.filter(x=>x[0]===16).map(x=>Buffer.from(x.slice(7)))).toString();
    assert.ok(uploaded.includes('CONFIG_ID = "A,D,F,E,-1,1,1"'));
    elements.arm.click();assert.equal(elements.kick.disabled,false);
    pointer(elements.move,'pointerdown',1,100,40);timerFn();await until(()=>messages.some(x=>x[0]===50&&new TextDecoder().decode(x.slice(3)).startsWith('v,140,0,0')));
    pointer(elements.move,'pointerup',1,100,40);timerFn();await until(()=>messages.some(x=>x[0]===50&&new TextDecoder().decode(x.slice(3)).startsWith('v,0,0,0')));
    elements.kick.click();timerFn();await until(()=>messages.some(x=>x[0]===50&&new TextDecoder().decode(x.slice(3)).startsWith('v,0,0,1')));
    elements.stop.click();await until(()=>messages.some(x=>x[0]===50&&new TextDecoder().decode(x.slice(3)).trim()==='x'));
    assert.equal(elements.kick.disabled,true);assert.equal(elements.arm.textContent,'Начать управление');
    const sent=messages.length;pointer(elements.move,'pointerdown',2,100,40);timerFn();
    assert.equal(messages.length,sent,'No movement resumes after stop');
    elements.leftPort.value='B';elements.leftPort.dispatchEvent(new Event('change'));
    assert.equal(elements.arm.disabled,true);
    assert.equal(elements.replaceSlot.checked,false);
    assert.equal(elements.startProgram.disabled,true);
    timerFn();await new Promise(r=>setTimeout(r,2));
    assert.equal(elements.arm.disabled,true,'Old readiness must not enable new motor configuration');
    elements.connect.click();await until(()=>!device.gatt.connected);
    assert.equal(elements.arm.disabled,true);
  }finally{
    for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
