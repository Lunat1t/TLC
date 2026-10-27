import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SERVICE,COMMAND_EVENT} from '../dist/pybricks-protocol.js';

class Element extends EventTarget {
  constructor(){super();this.disabled=false;this.checked=false;this.value='';this.textContent='';this.style={};this.children=[];this.knob={style:{}};this.capture=null;}
  add(child){this.children.push(child);}
  dispatchEvent(event){const result=super.dispatchEvent(event);this['on'+event.type]?.(event);return result;}
  click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
  querySelector(){return this.knob;}
  hasPointerCapture(id){return this.capture===id;}
  setPointerCapture(id){this.capture=id;}
  releasePointerCapture(){this.capture=null;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}
}
async function until(fn){for(let i=0;i<600;i++){if(fn())return;await new Promise(r=>setTimeout(r,2));}assert.fail('Timed out');}
test('one tap connects, starts Pybricks program, arms neutral control, and sends stop',async()=>{
  const ids=[...readFileSync(new URL('../dist/controller.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  const el=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const doc=new EventTarget();doc.getElementById=id=>{assert.ok(el[id],id);return el[id];};doc.hidden=false;
  const win=new EventTarget();win.isSecureContext=true;
  const writes=[];const ch=new Element();ch.startNotifications=async()=>ch;
  let readyResponse='SOCER_READY|A,-,-,1,1,1\n';
  function receive(text){const bytes=new TextEncoder().encode(text);const data=Uint8Array.of(1,...bytes);ch.value=new DataView(data.buffer);ch.dispatchEvent(new Event('characteristicvaluechanged'));}
  ch.writeValueWithResponse=async bytes=>{writes.push([...bytes]);if(bytes[0]===1)queueMicrotask(()=>receive(readyResponse));if(bytes[0]===6){const message=new TextDecoder().decode(bytes.subarray(1));if(message==='h\n')queueMicrotask(()=>receive(readyResponse));if(message.startsWith('v,'))queueMicrotask(()=>receive('SOCER_ACK\n'));}};
  const device=new EventTarget();device.name='Hub1';device.gatt={connected:false,async connect(){this.connected=true;return {getPrimaryService:async uuid=>{assert.equal(uuid,SERVICE);return {getCharacteristic:async char=>{assert.equal(char,COMMAND_EVENT);return ch;}};}};},disconnect(){this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));}};
  const originals=new Map();const put=(key,value)=>{originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
  let tick;
  put('document',doc);put('window',win);put('screen',{orientation:new EventTarget()});put('Option',class{constructor(label,value){this.textContent=label;this.value=value;}});
  put('navigator',{bluetooth:{requestDevice:async opts=>{assert.equal(opts.filters[0].services[0],SERVICE);return device;}}});
  put('setInterval',fn=>{tick=fn;return 1;});
  try{
    await import('../dist/app.js');
    assert.equal(el.arm.disabled,true);
    el.fullSetup.click();
    assert.equal(el.rightPort.value,'D');assert.equal(el.kickerPort.value,'F');assert.equal(el.leftReverse.checked,true);
    el.oneMotorSetup.click();
    assert.equal(el.rightPort.value,'none');assert.equal(el.kickerPort.value,'none');
    el.connect.click();await until(()=>el.status.textContent==='Программа готова'&&el.arm.textContent==='Пауза');
    assert.equal(el.connect.textContent,'Хаб подключён');
    assert.ok(writes.some(x=>x[0]===1),'The app starts the installed program after selecting the hub');
    assert.ok(writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='v,0,0,0\n'),'Auto arm starts with neutral speed');
    const move=el.move;move.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerId:1,clientX:100,clientY:40}));
    await until(()=>writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='v,140,0,0\n'));
    assert.equal(el.driveSpeed.textContent,'35%');
    move.dispatchEvent(Object.assign(new Event('pointermove'),{pointerId:1,clientX:100,clientY:70}));
    tick();await until(()=>writes.some(x=>/^v,(?:[1-9]|[1-9][0-9]|1[0-6][0-9]),0,0\n$/.test(new TextDecoder().decode(Uint8Array.from(x).subarray(1)))));
    assert.ok(parseInt(el.driveSpeed.textContent)>0&&parseInt(el.driveSpeed.textContent)<35);
    el.faster.click();el.faster.click();tick();
    await until(()=>writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='v,173,0,0\n'));
    assert.equal(el.driveSpeed.textContent,'43%');
    move.dispatchEvent(Object.assign(new Event('pointerup'),{pointerId:1}));
    await until(()=>writes.filter(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='v,0,0,0\n').length>=2);
    el.stop.click();await until(()=>writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='x\n'));
    assert.equal(writes[0][0],1);
    assert.ok(writes.slice(1).every(x=>x[0]===6));
    readyResponse='SOCER_READY|A,D,F,-SOCER_READY|A,D,F,-1,1,1\n1,1,1\n';
    el.startProgram.click();await until(()=>el.status.textContent==='Программа готова'&&el.rightPort.value==='D');
    assert.equal(el.kickerPort.value,'F');
    assert.equal(el.leftReverse.checked,true);
    assert.equal(el.arm.textContent,'Пауза');
    receive('SOCER_TUNING|600|240\n');
    receive('SOCER_CONTROL|DIRECT\n');
    assert.equal(el.hint.textContent,'Прямое управление включено.');
    el.forwardBtn.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerId:2}));
    tick();
    await until(()=>writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='v,600,0,0\n'));
    el.rightBtn.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerId:4}));
    tick();
    await until(()=>writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='v,0,240,0\n'));
    el.rightBtn.dispatchEvent(Object.assign(new Event('pointerup'),{pointerId:4}));
    el.leftBtn.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerId:5}));
    tick();
    await until(()=>writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='v,0,-240,0\n'));
    el.leftBtn.dispatchEvent(Object.assign(new Event('pointerup'),{pointerId:5}));
    el.forwardBtn.dispatchEvent(Object.assign(new Event('pointerup'),{pointerId:2}));
    el.kick.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerId:3}));
    await until(()=>writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1))==='k\n'));
    assert.ok(writes.some(x=>new TextDecoder().decode(Uint8Array.from(x).subarray(1)).startsWith('v,')&&new TextDecoder().decode(Uint8Array.from(x).subarray(1))!=='v,0,0,0\n'));
    receive('SOCER_ACKSOCER_ACK\n');
    receive('SOCER_LINK_LOST\n');
    assert.equal(el.status.textContent,'Команды задержались — моторы остановлены');
    assert.equal(el.connect.textContent,'Продолжить');
  }finally{device.gatt.disconnect();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
