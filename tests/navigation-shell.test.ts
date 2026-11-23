import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAIN_NAV_TABS,
  getExtraNavPages,
  getRoleLabel,
  getTopbarBrandTarget,
  getVisibleMainNavTabs,
  getRouteTransitionDirection,
  isNavPathActive,
  isNavigableAppPath,
  shouldShowMainNavTabs,
} from '../src/lib/navigation-shell.ts'

test('main top bar tabs match agreed routes and labels without battle-pass', () => {
  assert.deepEqual(
    MAIN_NAV_TABS.map((t) => [t.path, t.label]),
    [
      ['/dashboard', 'Рабочий стол'],
      ['/map', 'Роадмап'],
      ['/settings', 'Настройки'],
    ]
  )
})

test('top bar visibility covers app pages and excludes editor/auth/public', () => {
  for (const path of [
    '/dashboard',
    '/map',
    '/battle-pass',
    '/settings',
    '/instructions',
    '/instructions/123',
    '/teacher/roadmap',
    '/admin/instructions/drive',
    '/link-student',
  ]) {
    assert.equal(isNavigableAppPath(path), true, path)
  }

  for (const path of ['/', '/editor', '/login', '/register', '/trial', '/display-camera']) {
    assert.equal(isNavigableAppPath(path), false, path)
  }
})

test('plus menu filters extra pages by role and permissions', () => {
  assert.deepEqual(
    getExtraNavPages({ role: 'student', canPublish: false, isAdmin: false }).map((p) => p.path),
    ['/instructions']
  )
  assert.deepEqual(
    getExtraNavPages({ role: 'teacher', canPublish: true, isAdmin: false }).map((p) => p.path),
    ['/instructions', '/admin/instructions/drive', '/teacher/roadmap']
  )
  assert.deepEqual(
    getExtraNavPages({ role: 'parent', canPublish: false, isAdmin: false }).map((p) => p.path),
    []
  )
  assert.deepEqual(
    getExtraNavPages({ role: null, canPublish: false, isAdmin: false }).map((p) => p.path),
    []
  )
  assert.deepEqual(
    getExtraNavPages({ role: 'parent', canPublish: true, isAdmin: true }).map((p) => [p.path, p.label]),
    [
      ['/admin/instructions/drive', 'Добавить инструкцию'],
      ['/teacher/roadmap', 'Настроить роадмап'],
    ]
  )
})

test('route transition direction follows ordered tabs and handles subroutes cleanly', () => {
  assert.equal(getRouteTransitionDirection(null, '/dashboard'), 0)
  assert.equal(getRouteTransitionDirection('/dashboard', '/dashboard'), 0)
  assert.equal(getRouteTransitionDirection('/dashboard', '/map'), 1)
  assert.equal(getRouteTransitionDirection('/map', '/settings'), 1)
  assert.equal(getRouteTransitionDirection('/settings', '/dashboard'), -1)
  assert.equal(getRouteTransitionDirection('/instructions', '/instructions/item-1'), 0)
  assert.equal(getRouteTransitionDirection('/dashboard', '/instructions/item-1'), 1)
  assert.equal(getRouteTransitionDirection('/unknown', '/dashboard'), 0)
})

test('active path matching and role labels work for subroutes and roles', () => {
  assert.equal(isNavPathActive('/instructions/abc', '/instructions'), true)
  assert.equal(isNavPathActive('/dashboard', '/map'), false)
  assert.equal(getRoleLabel('student', false), 'Ученик')
  assert.equal(getRoleLabel('teacher', false), 'Учитель')
  assert.equal(getRoleLabel('parent', false), 'Родитель')
  assert.equal(getRoleLabel('student', true), 'Администратор')
  assert.equal(getRoleLabel(null, false), 'Аккаунт')
})

test('topbar filters workspace tabs and brand target for guest, parent, and student/teacher users', () => {
  assert.equal(shouldShowMainNavTabs('student'), true)
  assert.equal(shouldShowMainNavTabs('teacher'), true)
  assert.equal(shouldShowMainNavTabs('parent'), false)
  assert.equal(shouldShowMainNavTabs(null), false)

  assert.deepEqual(
    getVisibleMainNavTabs({ userId: null, role: null }).map((t) => t.path),
    ['/dashboard', '/settings']
  )
  assert.deepEqual(
    getVisibleMainNavTabs({ userId: 'u1', role: 'student' }).map((t) => t.path),
    ['/dashboard', '/map', '/settings']
  )
  assert.deepEqual(
    getVisibleMainNavTabs({ userId: 'u2', role: 'teacher' }).map((t) => t.path),
    ['/dashboard', '/map', '/settings']
  )
  assert.deepEqual(
    getVisibleMainNavTabs({ userId: 'u3', role: 'parent' }).map((t) => t.path),
    []
  )
  assert.deepEqual(
    getVisibleMainNavTabs({ userId: 'u4', role: null }).map((t) => t.path),
    []
  )

  assert.equal(getTopbarBrandTarget({ userId: 'u1', role: 'student' }).href, '/dashboard')
  assert.equal(getTopbarBrandTarget({ userId: 'u2', role: 'teacher' }).href, '/dashboard')
  assert.equal(getTopbarBrandTarget({ userId: 'u3', role: 'parent' }).href, '/settings')
  assert.equal(getTopbarBrandTarget({ userId: 'u4', role: null }).href, '/settings')
  assert.equal(getTopbarBrandTarget({ userId: null, role: null }).href, '/dashboard')
})
