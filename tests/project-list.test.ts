import assert from 'node:assert/strict'
import test from 'node:test'
import { countLabel, filterProjects } from '../src/lib/project-list.ts'
import type { RobotProject } from '../src/lib/projects.ts'

function project(id: string, name: string, hub: 'spike' | 'ev3', createdAt: string, updatedAt = createdAt): RobotProject {
  return { version: 1, id, name, hub, createdAt, updatedAt, devices: [], workspace: null }
}
const list = [
  project('a', 'Робот-сумо', 'spike', '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z'),
  project('b', 'Следование по линии', 'ev3', '2026-02-01T00:00:00Z'),
  project('c', 'Автопилот', 'spike', '2026-03-01T00:00:00Z', '2026-02-15T00:00:00Z'),
]

test('countLabel uses Russian plural forms', () => {
  assert.equal(countLabel(0), '0 проектов')
  assert.equal(countLabel(1), '1 проект')
  assert.equal(countLabel(3), '3 проекта')
  assert.equal(countLabel(11), '11 проектов')
  assert.equal(countLabel(21), '21 проект')
})

test('filterProjects searches by name case-insensitively and filters by robot', () => {
  const ids = (o: Parameters<typeof filterProjects>[1]) => filterProjects(list, o).map(p => p.id)
  assert.deepEqual(ids({ query: 'СУМО', hub: 'all', sort: 'updated' }), ['a'])
  assert.deepEqual(ids({ query: '  ', hub: 'ev3', sort: 'updated' }), ['b'])
  assert.deepEqual(ids({ query: 'нет такого', hub: 'all', sort: 'updated' }), [])
})

test('filterProjects sorts by update date, creation date and name without mutating input', () => {
  const copy = list.slice()
  const ids = (sort: 'updated' | 'created' | 'name') => filterProjects(list, { query: '', hub: 'all', sort }).map(p => p.id)
  assert.deepEqual(ids('updated'), ['a', 'c', 'b'])
  assert.deepEqual(ids('created'), ['c', 'b', 'a'])
  assert.deepEqual(ids('name'), ['c', 'a', 'b'])
  assert.deepEqual(list, copy)
})
