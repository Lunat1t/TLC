import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileControllerProgram} from '../public/controller-program.js';
import {createControllerSession} from '../src/lib/controller-runtime.ts';

test('an editor project dispatches its own control events to the safe session',async()=>{
 const project={id:'p',hub:'spike',workspace:{controlLayout:{version:1,areas:[],controls:[{id:'drive',kind:'drivetrain'}]},blocks:[
  {id:'press',type:'button',target:{controlId:'drive',input:'up'},event:'pressed'},
  {id:'move',type:'drive',parentId:'press',motor:'A',modules:['speed'],speed:200},
  {id:'release',type:'button',target:{controlId:'drive',input:'up'},event:'released'},
  {id:'brake',type:'stop',parentId:'release',motor:'A'}]}};
 let notify;const commands=[];const transport={connect:async fn=>{notify=fn},startHub:async()=>{},write:async line=>{commands.push(line);if(line==='h\n')notify('SOCER3_READY|A');if(line==='x\n')notify('SOCER2_STOP')},disconnect:async()=>{}};
 const program=compileControllerProgram(project);assert.equal(program.errors.length,0);
 const session=createControllerSession(transport);
 await session.setViewMode('check');await session.startProgram(program);session.dispatch({controlId:'drive',input:'up'},'pressed');session.dispatch({controlId:'drive',input:'up'},'released');
 assert.deepEqual(commands,[]);assert.ok(session.getState().log.some(entry=>entry.includes('Стоп мотора A')));
 await session.connect();await session.startHub();await session.setViewMode('check');await session.startProgram(program);
 session.dispatch({controlId:'drive',input:'up'},'pressed');await new Promise(resolve=>setTimeout(resolve,5));
 session.dispatch({controlId:'drive',input:'up'},'released');await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(commands.includes('m,A,200\n'));assert.ok(commands.includes('m,A,0\n'));
 await session.dispose();
});
