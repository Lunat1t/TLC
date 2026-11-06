import assert from 'node:assert/strict'
import test from 'node:test'
import { fullNameLogin, validateAccountPassword } from '../src/lib/account-credentials.ts'

test('full name login distinguishes surnames and trims input', () => {
  assert.equal(fullNameLogin(' Alua ', ' Serik '), 'Alua_Serik')
  assert.notEqual(fullNameLogin('Alua', 'Serik'), fullNameLogin('Alua', 'Omar'))
  assert.equal(fullNameLogin('Anna-Maria', 'Serik'), 'Anna-Maria_Serik')
})
test('both name fields must be valid and fit the server login limit', () => {
  for (const [first, last] of [['Alua', ''], ['', 'Serik'], ['Alua Test', 'Serik'], ['A'.repeat(30), 'Serik']]) {
    assert.throws(() => fullNameLogin(first, last))
  }
})
test('new passwords reject PINs and preserve spaces and symbols', () => {
  assert.throws(() => validateAccountPassword('0123'))
  assert.throws(() => validateAccountPassword('1234567'))
  assert.equal(validateAccountPassword('  my robot!  '), '  my robot!  ')
})
test('password limit counts UTF-8 bytes for bcrypt', () => {
  assert.equal(validateAccountPassword('я'.repeat(36)).length, 36)
  assert.throws(() => validateAccountPassword('я'.repeat(37)))
})
