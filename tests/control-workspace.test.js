import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {migrateControlWorkspace,validateControlLayout} from '../src/lib/control-workspace.ts';
import {readBlocks} from '../src/lib/workspace.ts';
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/controller/${name}`,import.meta.url),'utf8'));
const panelProject = () => {
  const project=fixture('autonomous.json');
  project.workspace.controlLayout={version:1,areas:[
    {id:'area',sheetId:'sheet-main',title:'Управление',x:0,y:0,width:640,height:360},
  ],controls:[
    {id:'panel',areaId:'area',kind:'motor-panel',label:'Кнопки моторов',x:0,y:0,width:180,height:132},
  ]};
  project.workspace.sheets[0].blocks.push({id:'panel-block',type:'motor-buttons',x:0,y:0,controlAreaId:'area'});
  return project;
};
test('migration removes unavailable handlers, detaches actions, preserves source and is idempotent',()=>{
  const source=fixture('controller.json'), before=JSON.stringify(source);
  const a=migrateControlWorkspace(source), b=migrateControlWorkspace(source);
  assert.equal(JSON.stringify(source),before);
  assert.deepEqual(a,b);assert.equal(a.changed,true);
  assert.equal(migrateControlWorkspace(a.project).changed,false);
  const blocks=readBlocks(a.project.workspace.sheets[0],'spike');
  assert.deepEqual(blocks.map(block=>block.id),['drive','stop']);
  assert.ok(blocks.every(block=>block.parentId===undefined));
  assert.equal(a.project.workspace.controlLayout,undefined);
});
test('migration keeps motor panels and merges duplicate areas on a sheet',()=>{
  const source=panelProject(), layout=source.workspace.controlLayout;
  layout.areas.push({...layout.areas[0],id:'duplicate'});
  layout.controls.push({...layout.controls[0],id:'removed-panel',areaId:'duplicate'});
  source.workspace.sheets[0].blocks.at(-1).controlAreaId='duplicate';
  const before=JSON.stringify(source);
  const result=migrateControlWorkspace(source);
  assert.equal(JSON.stringify(source),before);
  assert.equal(result.changed,true);
  assert.equal(result.project.workspace.controlLayout.areas.length,1);
  assert.deepEqual(result.project.workspace.controlLayout.controls.map(control=>control.id),['panel']);
  assert.equal(result.project.workspace.sheets[0].blocks.at(-1).controlAreaId,'area');
  assert.equal(migrateControlWorkspace(result.project).changed,false);
});
test('autonomous projects stay unchanged and unknown layout versions are rejected',()=>{
  const source=fixture('autonomous.json');assert.equal(migrateControlWorkspace(source).changed,false);
  source.workspace.controlLayout={version:2,areas:[],controls:[]};
  assert.throws(()=>migrateControlWorkspace(source),/версия/);
});
test('layout rejects overlap, out of bounds and unknown controls',()=>{
  const layout=panelProject().workspace.controlLayout;
  const control=layout.controls[0];
  assert.throws(()=>validateControlLayout({...layout,controls:[control,{...control,id:'second'}]},['sheet-main']),/перекрываются/);
  assert.throws(()=>validateControlLayout({...layout,controls:[{...control,x:600}]},['sheet-main']),/вне области/);
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
  assert.equal(result.readOnly,true);
  assert.deepEqual(readBlocks(result.projects[0].workspace.sheets[0]).map(block=>block.id),['drive','stop']);
  assert.equal(result.raw,source);
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
  assert.deepEqual(validateControlLayout(layout,['sheet-main']),layout);
});

test('cloning a sheet remaps panel areas and block parents without altering the source',async()=>{
  const {cloneControlSheet}=await import('../src/lib/control-workspace.ts');
  const project=panelProject(), before=JSON.stringify(project);
  const state={sheets:project.workspace.sheets,activeSheetId:'sheet-main'};
  let i=0;
  const result=cloneControlSheet(state,project.workspace.controlLayout,'sheet-main','copy','Копия',()=>`new-${++i}`);
  const copied=result.state.sheets[1], area=result.layout.areas.find(area=>area.sheetId==='copy');
  const control=result.layout.controls.find(control=>control.areaId===area.id);
  assert.equal(JSON.stringify(project),before);
  assert.ok(copied.blocks.every(block=>block.id.startsWith('new-')));
  const copiedIds=new Set(copied.blocks.map(block=>block.id));
  assert.ok(copied.blocks.filter(block=>block.parentId).every(block=>copiedIds.has(block.parentId)));
  assert.equal(copied.blocks.find(block=>block.type==='motor-buttons').controlAreaId,area.id);
  assert.notEqual(control.id,'panel');
  validateControlLayout(result.layout,result.state.sheets.map(sheet=>sheet.id));
});
test('a sheet cannot contain two control areas',()=>{
  const layout=panelProject().workspace.controlLayout, before=JSON.stringify(layout);
  assert.throws(()=>validateControlLayout({...layout,areas:[...layout.areas,{...layout.areas[0],id:'copy'}]},['sheet-main']),/только одну область/);
  assert.equal(JSON.stringify(layout),before);
});

test('migration rejects unknown controls without changing source',()=>{
  const project=panelProject(),before=JSON.stringify(project);
  project.workspace.controlLayout.controls[0].kind='unknown';
  const raw=JSON.stringify(project);
  assert.throws(()=>migrateControlWorkspace(project),/Неверный элемент/);
  assert.equal(JSON.stringify(project),raw);
  assert.notEqual(raw,before);
});
