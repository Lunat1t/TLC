import assert from 'node:assert/strict';
import test from 'node:test';
import {createControllerSession} from '../src/lib/controller-runtime.ts';

const program=()=>({projectId:'p',projectName:'p',hub:'spike',protocol:2,ports:['A'],startup:[{kind:'run',port:'A',speed:100}],handlers:[{target:{controlId:'one',input:'up'},button:'up',event:'pressed',sourceBlockId:'b',actions:[{kind:'run',port:'A',speed:200}]}],errors:[]});
function fake(){let onLine;let disconnected=false;const writes=[];return {writes,connect:async(fn)=>{onLine=fn},startHub:async()=>{},write:async(line)=>{writes.push(line);if(line==='h\n')onLine('SOCER3_READY|A');if(line==='x\n')onLine('SOCER2_STOP')},disconnect:async()=>{disconnected=true},get disconnected(){return disconnected}}}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
test('trial never writes, READY does not start, live startup is once and stop is acknowledged',async()=>{
 const t=fake(),session=createControllerSession(t),p=program();
 await session.setViewMode('check');await session.startProgram(p);session.dispatch({controlId:'one',input:'up'},'pressed');await tick();assert.deepEqual(t.writes,[]);
 await session.connect();await session.startHub();assert.deepEqual(t.writes,['h\n']);assert.equal(session.getState().program,'trial-running');
 await session.setViewMode('check');await session.startProgram(p);await tick();assert.equal(t.writes.filter(x=>x==='m,A,100\n').length,1);
 session.dispatch({controlId:'one',input:'up'},'pressed');await tick();assert.ok(t.writes.includes('m,A,200\n'));
 await session.stop();assert.equal(session.getState().message,'Моторы остановлены.');assert.ok(t.writes.includes('x\n'));
 await session.dispose();assert.equal(t.disconnected,true);
});
test('button error blocks only its input while empty control produces no motor command',async()=>{
 const t=fake(),session=createControllerSession(t),p=program();p.startup=[];p.errors.push({scope:'handler',severity:'error',target:{controlId:'one',input:'up'},code:'bad',message:'Ошибка'});
 await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);
 session.dispatch({controlId:'one',input:'up'},'pressed');session.dispatch({controlId:'two',input:'up'},'pressed');await tick();
 assert.equal(t.writes.some(x=>x.startsWith('m,')),false);assert.ok(session.getState().log.some(x=>x.includes('Ошибка')));
 await session.dispose();
});

test('stop invalidates queued motor commands before sending x',async()=>{
  let notify,releaseWrite;const sent=[];
  const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{sent.push(line);if(line==='h\n')notify('SOCER3_READY|A,B');if(line==='m,A,100\n')await new Promise(resolve=>{releaseWrite=resolve});if(line==='x\n')notify('SOCER2_STOP')},disconnect:async()=>{}};
  const session=createControllerSession(t),p=program();p.handlers.push({target:{controlId:'two',input:'up'},button:'up',event:'pressed',sourceBlockId:'b2',actions:[{kind:'run',port:'B',speed:300}]});
  await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);await tick();assert.ok(releaseWrite);
  session.dispatch({controlId:'two',input:'up'},'pressed');const stopping=session.stop();releaseWrite();await stopping;await tick();
  assert.equal(sent.includes('m,B,300\n'),false);assert.ok(sent.includes('x\n'));await session.dispose();
});

test('missing stop acknowledgement disconnects and requires a fresh connection',async()=>{
  let notify,closed=false,acknowledgeStop=false;const sent=[];
  const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{sent.push(line);if(line==='h\n')notify('SOCER3_READY|A');if(line==='x\n'&&acknowledgeStop)notify('SOCER2_STOP')},disconnect:async()=>{closed=true}};
  const session=createControllerSession(t),p=program();p.startup=[];
  await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);await session.stop();
  assert.equal(session.getState().transport,'fault');assert.equal(closed,true);assert.match(session.getState().message,/не подтверждена/);
  notify('SOCER2_STOP');assert.equal(session.getState().transport,'fault');await session.setViewMode('check');await session.startProgram(p);assert.equal(session.getState().program,'stopped');
  acknowledgeStop=true;await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);assert.equal(session.getState().program,'live-running');await session.stop();assert.equal(session.getState().message,'Моторы остановлены.');await session.dispose();
});

test('failed in-flight motor write does not send stop into a broken queue',async()=>{
  let notify, release;const sent=[];let disconnected=false;
  const transport={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{sent.push(line);if(line==='h\n')notify('SOCER3_READY|A');if(line==='m,A,100\n')await new Promise((_,reject)=>{release=reject})},disconnect:async()=>{disconnected=true}};
  const session=createControllerSession(transport);await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(program());await tick();
  const stopping=session.stop();release(new Error('write failed'));await stopping;await tick();
  assert.equal(sent.includes('x\n'),false);assert.equal(disconnected,true);assert.equal(session.getState().transport,'fault');await session.dispose();
});

test('a delayed stop from an older handler cannot stop the newer owner of a motor',async()=>{
 const t=fake(),session=createControllerSession(t),p=program();p.startup=[];p.protocol=3;
 p.handlers=[{target:{controlId:'one',input:'up'},button:'up',event:'pressed',sourceBlockId:'a',actions:[{kind:'dcTime',port:'A',power:50,ms:40},{kind:'wait',ms:40},{kind:'stop',port:'A'}]},{target:{controlId:'two',input:'up'},button:'up',event:'pressed',sourceBlockId:'b',actions:[{kind:'run',port:'A',speed:200}]}];
 await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);session.dispatch({controlId:'one',input:'up'},'pressed');await tick();session.dispatch({controlId:'two',input:'up'},'pressed');await new Promise(resolve=>setTimeout(resolve,70));
 assert.ok(t.writes.includes('d,A,50\n'));assert.ok(t.writes.includes('m,A,200\n'));assert.equal(t.writes.includes('m,A,0\n'),false);await session.dispose();
});

test('unattached control event does not stop a continuously running motor on release',async()=>{
 const t=fake(),session=createControllerSession(t),p=program();p.startup=[];
 await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);session.dispatch({controlId:'one',input:'up'},'pressed');await tick();session.dispatch({controlId:'one',input:'up'},'released');await tick();
 assert.ok(t.writes.includes('m,A,200\n'));assert.equal(t.writes.includes('m,A,0\n'),false);await session.dispose();
});

test('disposed sessions ignore notifications from the previous connection',async()=>{
 let notify,updates=0;const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{if(line==='h\n')notify('SOCER3_READY|A');if(line==='x\n')notify('SOCER2_STOP')},disconnect:async()=>{}};
 const session=createControllerSession(t);const unsub=session.subscribe(()=>updates++);await session.connect();await session.startHub();await session.setViewMode('check');const p=program();p.startup=[];await session.startProgram(p);await session.dispose();const count=updates;notify('SOCER3_READY|A');notify('SOCER2_ACK');assert.equal(updates,count);unsub();
});

test('lost hub program stops the session and ignores its subsequent messages',async()=>{
 let notify,closed=0;const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{if(line==='h\n')notify('SOCER3_READY|A')},disconnect:async()=>{closed++}};
 const session=createControllerSession(t),p=program();p.startup=[];await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);
 notify('SOCER2_LINK_LOST');await tick();assert.equal(session.getState().transport,'fault');assert.equal(session.getState().program,'stopped');assert.equal(closed,1);
 notify('SOCER3_READY|A');assert.equal(session.getState().transport,'fault');await session.dispose();
});

test('missing heartbeat acknowledgement closes the connection',async()=>{
 let now=0,interval,notify,closed=false;const clock={now:()=>now,setTimeout,clearTimeout,setInterval:(fn)=>{interval=fn;return 1},clearInterval:()=>{interval=null}};
 const t={connect:async(fn)=>{notify=fn},startHub:async()=>{},write:async(line)=>{if(line==='h\n')notify('SOCER3_READY|A')},disconnect:async()=>{closed=true}};
 const session=createControllerSession(t,clock),p=program();p.startup=[];await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(p);
 now=1801;interval();await tick();assert.equal(session.getState().transport,'fault');assert.equal(session.getState().program,'stopped');assert.equal(closed,true);assert.equal(interval,null);await session.dispose();
});
