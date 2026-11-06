import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultNavigationLayout, layoutAtPosition, layoutPosition, readNavigationLayout } from '../src/lib/navigation-layout.ts'

test('invalid stored layouts recover a complete navigation', () => {
  for (const raw of [null, 'broken', '{}', '{"order":["projects","projects"]}', '{"order":["unexpected"]}']) assert.deepEqual(readNavigationLayout(raw).order, ['projects','instructions'])
  assert.deepEqual(readNavigationLayout('{"x":-100,"y":200,"vertical":true,"order":["instructions","projects"]}'), {x:0,y:1,vertical:true,order:['instructions','projects']})
})
test('dragging clamps at every edge', () => {
  const bounds={left:12,top:12,width:976,height:676}, size={width:240,height:60}
  const upper=layoutAtPosition(defaultNavigationLayout(),-500,-500,bounds,size)
  assert.deepEqual(layoutPosition(upper,bounds,size), {left:12,top:12})
  const lower=layoutAtPosition(defaultNavigationLayout(),2000,2000,bounds,size)
  assert.deepEqual(layoutPosition(lower,bounds,size), {left:748,top:628})
})
test('normalized positions stay inside a resized viewport', () => {
  const layout={...defaultNavigationLayout(),x:1,y:1}
  assert.deepEqual(layoutPosition(layout,{left:12,top:12,width:296,height:456},{width:240,height:60}),{left:68,top:408})
  const cramped=layoutAtPosition(layout,10,10,{left:12,top:12,width:240,height:60},{width:240,height:60})
  assert(Number.isFinite(cramped.x) && Number.isFinite(cramped.y))
})
test('the settings control remains reachable when the panel reaches its corner', () => {
  const position=layoutPosition({...defaultNavigationLayout(),x:1,y:1},{left:12,top:12,width:296,height:544},{width:240,height:60},{left:250,top:490,width:60,height:60})
  assert.equal(position.top+60,490)
  assert(position.left>=12 && position.left+240<=308)
})

test('side edges automatically turn the panel vertical and top/bottom horizontal', async () => {
  const { dockNavigationLayout, navigationDock } = await import('../src/lib/navigation-layout.ts')
  for (const [x,y,edge,vertical] of [[.02,.5,'left',true],[.98,.5,'right',true],[.5,.02,'top',false],[.5,.98,'bottom',false]] as const) {
    const docked=dockNavigationLayout({...defaultNavigationLayout(),x,y},{left:12,top:12,width:1200,height:760})
    assert.equal(navigationDock(docked),edge)
    assert.equal(docked.vertical,vertical)
    assert(docked.x===0 || docked.x===1 || docked.y===0 || docked.y===1)
  }
})

test('role navigation hides all parent pages and adds publishing for teachers', async () => {
  const { navigationPages, reconcilePageOrder, moveNavigationPage } = await import('../src/lib/navigation-layout.ts')
  assert.deepEqual(navigationPages('parent',true),[])
  assert.deepEqual(navigationPages(null),[])
  assert.deepEqual(navigationPages('student'),['projects','instructions'])
  assert.deepEqual(navigationPages('teacher',true),['projects','instructions','add-instruction'])
  const teacher=reconcilePageOrder(['instructions','projects'],navigationPages('teacher',true))
  assert.deepEqual(teacher,['instructions','projects','add-instruction'])
  assert.deepEqual(moveNavigationPage(teacher,2,0),['add-instruction','instructions','projects'])
  assert.deepEqual(reconcilePageOrder(['add-instruction','instructions','projects'],navigationPages('student')),['instructions','projects'])
  assert.deepEqual(readNavigationLayout(JSON.stringify({...defaultNavigationLayout(),order:teacher})).order,teacher)
})
