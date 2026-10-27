import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subscribeNotifications} from '../dist/notifications.js';
test('notification handler survives a native bridge clearing listeners during start',async()=>{
  let handlers=new Set(),received=0;
  const characteristic={addEventListener(_,handler){handlers.add(handler);},removeEventListener(_,handler){handlers.delete(handler);},async startNotifications(){handlers.clear();return this;}};
  await subscribeNotifications(characteristic,()=>received++);
  for(const handler of handlers)handler();
  assert.equal(received,1);
});
test('standard EventTarget callback is attached only once',async()=>{
  const c=new EventTarget();c.startNotifications=async()=>c;let received=0;
  await subscribeNotifications(c,()=>received++);c.dispatchEvent(new Event('characteristicvaluechanged'));assert.equal(received,1);
});
test('a replacement notification object owns the callback',async()=>{
  const original=new EventTarget(),replacement=new EventTarget();let received=0;
  original.startNotifications=async()=>replacement;
  await subscribeNotifications(original,()=>received++);
  original.dispatchEvent(new Event('characteristicvaluechanged'));assert.equal(received,0);
  replacement.dispatchEvent(new Event('characteristicvaluechanged'));assert.equal(received,1);
});
test('failed subscription removes stale listener',async()=>{
  const c=new EventTarget();let received=0;c.startNotifications=async()=>{throw new Error('notify failed');};
  await assert.rejects(subscribeNotifications(c,()=>received++),/notify failed/);
  c.dispatchEvent(new Event('characteristicvaluechanged'));assert.equal(received,0);
});
