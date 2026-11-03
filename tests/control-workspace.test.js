import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {migrateControlWorkspace,validateControlLayout} from '../src/lib/control-workspace.ts';
import {readBlocks} from '../src/lib/workspace.ts';
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/controller/${name}`,import.meta.url),'utf8'));
test('legacy event migration is deterministic, preserves source, and is idempotent',()=>{
  const source=fixture('controller.json'), before=JSON.stringify(source);
  const a=migrateControlWorkspace(source), b=migrateControlWorkspace(source);
  assert.equal(JSON.stringify(source),before);
  assert.deepEqual(a,b);assert.equal(a.changed,true);
  assert.equal(migrateControlWorkspace(a.project).changed,false);
  const workspace=a.project.workspace, layout=validateControlLayout(workspace.controlLayout,['sheet-main']);
  const events=readBlocks(workspace.sheets[0],'spike').filter(x=>x.type==='button');
  assert.equal(events.length,2);assert.deepEqual(events.map(x=>x.target.input),['up','up']);
  assert.ok(events.every(x=>x.target.controlId===layout.controls[0].id));
});
test('autonomous projects stay unchanged and unknown layout versions are rejected',()=>{
  const source=fixture('autonomous.json');assert.equal(migrateControlWorkspace(source).changed,false);
  source.workspace.controlLayout={version:2,areas:[],controls:[]};
  assert.throws(()=>migrateControlWorkspace(source),/версия/);
});
test('layout rejects overlap, out of bounds and unknown controls',()=>{
  const layout=migrateControlWorkspace(fixture('controller.json')).project.workspace.controlLayout;
  const control=layout.controls[0];
  assert.throws(()=>validateControlLayout({...layout,controls:[control,{...control,id:'second'}]},['sheet-main']),/перекрываются/);
  assert.throws(()=>validateControlLayout({...layout,controls:[{...control,x:500}]},['sheet-main']),/вне области/);
  assert.throws(()=>validateControlLayout({...layout,controls:[{...control,kind:'other'}]},['sheet-main']),/Неверный элемент/);
});

test('project migration backs up source before writing and rejects stale writes', async()=>{
  const {prepareEditorProjects,saveEditorProjects,STORAGE_KEY}=await import('../src/lib/projects.ts');
  const source=JSON.stringify([fixture('controller.json')]); const data=new Map([[STORAGE_KEY,source]]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
  const locks={request:async (_name,callback)=>callback()};
  const ready=await prepareEditorProjects(storage,'fixture-controller',locks);
  assert.equal(data.get(`${STORAGE_KEY}.backup.fixture-controller`),source);
  assert.notEqual(ready.raw,source);
  data.set(STORAGE_KEY,'[]');
  await assert.rejects(saveEditorProjects(storage,ready.projects,ready.raw,locks),/другой вкладке/);
  assert.equal(data.get(STORAGE_KEY),'[]');
});

test('backup quota failure never overwrites original projects', async()=>{
  const {prepareEditorProjects,STORAGE_KEY}=await import('../src/lib/projects.ts');
  const source=JSON.stringify([fixture('controller.json')]); const data=new Map([[STORAGE_KEY,source]]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(key.includes('.backup.')) throw Error('quota');data.set(key,value)}};
  await assert.rejects(prepareEditorProjects(storage,'fixture-controller',{request:async (_n,cb)=>cb()}),/quota/);
  assert.equal(data.get(STORAGE_KEY),source);
});

test('when cross-tab locks are unavailable projects remain readable without storage writes',async()=>{
  const {prepareEditorProjects,saveEditorProjects,STORAGE_KEY}=await import('../src/lib/projects.ts');
  const source=JSON.stringify([fixture('controller.json')]);let writes=0;
  const storage={getItem:key=>key===STORAGE_KEY?source:null,setItem:()=>writes++};
  const result=await prepareEditorProjects(storage,'fixture-controller',undefined);
  assert.equal(result.readOnly,true);assert.equal(result.projects[0].workspace.controlLayout.version,1);
  await assert.rejects(saveEditorProjects(storage,result.projects,result.raw,undefined));
  assert.equal(writes,0);
});

test('pre-change autonomous fixture exports identical Pybricks code',async()=>{
  const {generatePybricks}=await import('../src/lib/workspace.ts');
  const project=fixture('autonomous.json');
  const expected=readFileSync(new URL('./fixtures/controller/autonomous.py',import.meta.url),'utf8');
  assert.equal(generatePybricks(project.workspace.sheets[0].blocks,'spike'),expected);
});

test('legacy visual import leaves stored configuration unchanged and creates no motor commands',async()=>{
  const {importLegacyControls}=await import('../src/lib/control-workspace.ts');
  const old=fixture('legacy-layout.json'),original=JSON.stringify(old);let i=0;
  const layout=importLegacyControls(old,{version:1,areas:[],controls:[]},'sheet-main',()=>`import-${++i}`);
  assert.equal(JSON.stringify(old),original);assert.equal(layout.controls.length,2);
  assert.ok(layout.controls.every(c=>!('ports' in c)&&!('speed' in c)&&!('reverse' in c)));
  validateControlLayout(layout,['sheet-main']);
});

test('cloning a sheet remaps internal control and block IDs but retains external targets',async()=>{
 const {cloneControlSheet}=await import('../src/lib/control-workspace.ts');const p=migrateControlWorkspace(fixture('controller.json')).project;
 p.workspace.sheets[0].blocks.push({id:'external',type:'button',x:300,y:0,target:{controlId:'outside',input:'up'}});
 let i=0;const result=cloneControlSheet({sheets:p.workspace.sheets,activeSheetId:'sheet-main'},p.workspace.controlLayout,'sheet-main','copy','Копия',()=>`new-${++i}`);
 const copied=result.state.sheets[1];const area=result.layout.areas.find(a=>a.sheetId==='copy');const control=result.layout.controls.find(c=>c.areaId===area.id);
 assert.ok(copied.blocks.filter(b=>b.id!=='external').every(b=>b.id.startsWith('new-')));
 assert.ok(copied.blocks.filter(b=>b.target?.input==='up'&&b.target.controlId!=='outside').every(b=>b.target.controlId===control.id));
 assert.ok(copied.blocks.some(b=>b.target?.controlId==='outside'));
});

test('copying an area creates new controls without changing existing handler targets',async()=>{
 const {cloneControlArea}=await import('../src/lib/control-workspace.ts');const project=migrateControlWorkspace(fixture('controller.json')).project;
 const old=project.workspace.controlLayout, oldTarget=project.workspace.sheets[0].blocks[0].target.controlId;let i=0;
 const copied=cloneControlArea(old,old.areas[0].id,()=>`copy-${++i}`);
 assert.equal(copied.areas.length,2);assert.equal(copied.controls.length,2);
 assert.notEqual(copied.controls[1].id,oldTarget);assert.equal(project.workspace.sheets[0].blocks[0].target.controlId,oldTarget);
});
