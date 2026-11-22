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
// A genuinely retired type still requires backup and child detachment.
const retiredProject = () => {
  const project=fixture('controller.json');
  for (const block of project.workspace.sheets[0].blocks) if (block.type==='button') block.type='empty';
  return project;
};
test('migration preserves supported button events and their action chains',()=>{
  const source=fixture('controller.json'), before=JSON.stringify(source);
  const result=migrateControlWorkspace(source);
  assert.equal(result.changed,false);
  assert.equal(JSON.stringify(source),before);
  assert.deepEqual(readBlocks(result.project.workspace.sheets[0]).map(block=>[block.id,block.parentId]),[
    ['press',undefined],['drive','press'],['release',undefined],['stop','release'],
  ]);
});
test('migration removes retired blocks, detaches actions, preserves source and is idempotent',()=>{
  const source=retiredProject(), before=JSON.stringify(source);
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
  const source=JSON.stringify([retiredProject()]); const data=new Map([[STORAGE_KEY,source]]);
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
  const source=JSON.stringify([retiredProject()]); const data=new Map([[STORAGE_KEY,source]]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(key.includes('.backup.')) throw Error('quota');data.set(key,value)}};
  await assert.rejects(prepareEditorProjects(storage,'fixture-controller',{request:async (_n,cb)=>cb()}),/quota/);
  assert.equal(data.get(STORAGE_KEY),source);
});

test('when cross-tab locks are unavailable projects remain readable without storage writes',async()=>{
  const {prepareEditorProjects,saveEditorProjects,STORAGE_KEY}=await import('../src/lib/projects.ts');
  const source=JSON.stringify([retiredProject()]);let writes=0;
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

test('cloning remaps local color and arrow targets but preserves external references',async()=>{
  const {cloneControlSheet}=await import('../src/lib/control-workspace.ts');
  const project=panelProject(), sheet=project.workspace.sheets[0];
  sheet.blocks.find(block=>block.id==='panel-block').controlModules=['red','green','yellow'];
  const layout=project.workspace.controlLayout;
  layout.controls.push({id:'arrows',areaId:'area',kind:'drive-turn',label:'Стрелки',x:200,y:0,width:132,height:96});
  for (const input of ['blue','red','green','yellow']) for (const event of ['pressed','released']) {
    const id=`${input}-${event}`;
    sheet.blocks.push({id,type:'button',x:0,y:0,event,target:{controlId:'panel-block',input}});
    sheet.blocks.push({id:`action-${id}`,type:'stop',parentId:id,x:0,y:54,motor:'A'});
  }
  sheet.blocks.push({id:'arrow-event',type:'button',x:0,y:0,event:'pressed',target:{controlId:'arrows',input:'left'}});
  sheet.blocks.push({id:'external-event',type:'button',x:0,y:0,event:'released',target:{controlId:'external-panel',input:'red'}});
  project.workspace.sheets.push({id:'outside',name:'Другой',blocks:[{id:'external-panel',type:'motor-buttons',x:0,y:0}]});
  const before=JSON.stringify(project);let i=0;
  const result=cloneControlSheet({sheets:project.workspace.sheets,activeSheetId:sheet.id},layout,sheet.id,'copy','Копия',()=>`copy-${++i}`);
  const copied=result.state.sheets.find(item=>item.id==='copy');
  const newPanel=copied.blocks.find(block=>block.type==='motor-buttons');
  const newArea=result.layout.areas.find(area=>area.sheetId==='copy');
  const newArrows=result.layout.controls.find(control=>control.kind==='drive-turn'&&control.areaId===newArea.id);
  assert.notEqual(newPanel.id,'panel-block');
  for (const input of ['blue','red','green','yellow']) for (const event of ['pressed','released']) {
    const handler=copied.blocks.find(block=>block.type==='button'&&block.event===event&&block.target?.input===input&&block.target.controlId===newPanel.id);
    assert.ok(handler,`${input} ${event} must target the copied panel`);
    assert.ok(copied.blocks.some(block=>block.parentId===handler.id));
  }
  assert.ok(copied.blocks.some(block=>block.target?.controlId===newArrows.id&&block.target.input==='left'));
  assert.equal(copied.blocks.filter(block=>block.target?.controlId==='external-panel').length,1);
  assert.equal(JSON.stringify(project),before);
  const roundTrip=JSON.parse(JSON.stringify(copied));
  assert.deepEqual(readBlocks(roundTrip).filter(block=>block.type==='button').map(block=>block.target),copied.blocks.filter(block=>block.type==='button').map(block=>block.target));
});

test('migration preserves chassis blocks and project chassis configuration', () => {
  const project = panelProject();
  project.workspace.chassis = { leftPort: 'A', rightPort: 'B', leftReversed: false, rightReversed: true, speed: 450 };
  project.workspace.sheets[0].blocks.push({ id: 'ch1', type: 'chassis', x: 0, y: 60, chassisDirection: 'forward' });
  const migrated = migrateControlWorkspace(project);
  assert.equal(migrated.changed, false);
  assert.ok(migrated.project.workspace.sheets[0].blocks.some(b => b.id === 'ch1'));
  assert.deepEqual(migrated.project.workspace.chassis, project.workspace.chassis);
});


test('distance-gauge widget and sensor blocks validate, clone, and survive migration', () => {
  const project = panelProject();
  project.workspace.sheets[0].blocks.push({
    id: 'sen-1', type: 'sensor', x: 10, y: 80, sensorPort: 'D', sensorOp: 'lt', sensorDistance: 25, sensorModules: ['threshold'],
  });
  project.workspace.controlLayout.controls.push({
    id: 'gauge-1', areaId: 'area', kind: 'distance-gauge', label: 'Дальномер', port: 'D', x: 200, y: 0, width: 160, height: 112,
  });
  const migrated = migrateControlWorkspace(project);
  assert.equal(migrated.changed, false);
  assert.ok(migrated.project.workspace.sheets[0].blocks.some(b => b.id === 'sen-1'));
  assert.equal(migrated.project.workspace.controlLayout.controls.find(c => c.id === 'gauge-1').port, 'D');

  const badPortLayout = JSON.parse(JSON.stringify(project.workspace.controlLayout));
  badPortLayout.controls.find(c => c.id === 'gauge-1').port = 'A';
  assert.throws(() => validateControlLayout(badPortLayout, ['sheet-main']), /Неверный порт дальномера/);
});
