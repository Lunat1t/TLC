import assert from 'node:assert/strict'
import test from 'node:test'
import { createRouteWarmer, isApplicationPath, startupRoutes } from '../src/lib/startup.ts'

test('startup applies to app routes without blocking public entry and onboarding', () => {
  for (const path of ['/dashboard','/avatar','/profile','/instructions','/instructions/a','/editor','/admin/instructions/drive','/teacher/achievements']) assert.equal(isApplicationPath(path),true,path)
  for (const path of ['/','/trial','/login','/register','/auth/callback','/instructions-public']) assert.equal(isApplicationPath(path),false,path)
})

test('startup preloads only common pages for the current role', () => {
  for (const role of ['student','teacher']) {
    assert.deepEqual(startupRoutes(role),['/dashboard','/instructions','/avatar','/profile'])
    assert(startupRoutes(role).every(path=>!path.startsWith('/editor')&&!path.startsWith('/admin')))
  }
  assert.deepEqual(startupRoutes('parent'),['/profile'])
  assert.deepEqual(startupRoutes(null),[])
})

test('startup and hover preloads share a cache and expire instead of repeating', () => {
  let clock=0
  const calls:string[]=[]
  const warmer=createRouteWarmer(path=>calls.push(path),()=>clock)
  warmer.warm('/instructions');warmer.warm('/instructions')
  clock=29_999;warmer.warm('/instructions')
  assert.equal(calls.length,1)
  clock=30_000;warmer.warm('/instructions')
  assert.equal(calls.length,2)
  warmer.clear();warmer.warm('/instructions')
  assert.equal(calls.length,3)
})

test('preload failures are retryable and external URLs are ignored', () => {
  let calls=0
  const warmer=createRouteWarmer(()=>{calls++;throw new Error('offline')})
  warmer.warm('https://example.com');warmer.warm('//example.com')
  assert.equal(calls,0)
  warmer.warm('/avatar');warmer.warm('/avatar')
  assert.equal(calls,2)
})
