import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  AVATAR_ROUTE,
  loadAuthState,
  saveAvatarChoice,
  signInStudent,
  validateLoginInput,
} from '../dist/auth.js';
import {
  AVATAR_PRESETS,
  BLACK,
  WHITE,
  hexToRgb,
  resolveOrbConfig,
} from '../dist/live-orb.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, val) => map.set(key, String(val)),
  };
}

test('validateLoginInput accepts valid student login and rejects empty or short password', () => {
  assert.deepEqual(
    validateLoginInput({ login: '  robo_student ', password: '1234' }),
    { login: 'robo_student' }
  );
  assert.throws(() => validateLoginInput({ login: '   ', password: '1234' }));
  assert.throws(() => validateLoginInput({ login: 'student', password: '123' }));
});

test('saveAvatarChoice and signInStudent persist LiveOrb avatar and student session', () => {
  const store = memoryStorage();
  const initial = loadAuthState(store);
  assert.equal(initial.user, null);
  assert.equal(initial.avatar.presetId, AVATAR_PRESETS[0].id);

  saveAvatarChoice(store, {
    presetId: 'tlc-cyber',
    name: 'TLC Импульс',
    variant: 'webgl',
    colors: ['#02C7EA', '#38BDF8', '#7DD3C7'],
    nickname: 'Alex',
  });

  const afterAvatar = loadAuthState(store);
  assert.equal(afterAvatar.avatar.presetId, 'tlc-cyber');
  assert.equal(afterAvatar.user.nickname, 'Alex');

  const signedIn = signInStudent(
    store,
    { login: 'alex_spike', password: 'secret' },
    new Date('2026-10-28T09:00:00Z')
  );
  assert.equal(signedIn.user.login, 'alex_spike');
  assert.equal(signedIn.user.nickname, 'Alex');
  assert.equal(signedIn.avatar.presetId, 'tlc-cyber');
});

test('resolveOrbConfig and hexToRgb support white, black, webgl, and custom LiveOrb variants', () => {
  assert.equal(resolveOrbConfig({ variant: 'white' }).color, WHITE.color);
  assert.equal(resolveOrbConfig({ variant: 'black' }).color, BLACK.color);
  assert.equal(resolveOrbConfig({ variant: 'webgl' }).mode, 1);
  assert.equal(resolveOrbConfig({ variant: 'custom', color: '#02C7EA' }).color, '#02C7EA');

  const [r, g, b] = hexToRgb('#ffffff');
  assert.equal(r, 1);
  assert.equal(g, 1);
  assert.equal(b, 1);
});

test('login.html has login-only form, disabled teacher button, and registration link to avatar.html', () => {
  const loginHtml = fs.readFileSync(
    path.resolve(import.meta.dirname, '../dist/login.html'),
    'utf8'
  );
  assert.match(loginHtml, /id="loginForm"/);
  assert.match(loginHtml, /id="teacherLoginBtn"[^>]*disabled/s);
  assert.match(loginHtml, new RegExp(`id="registerRedirect"[^>]*href="${AVATAR_ROUTE}"`, 's'));

  const avatarHtml = fs.readFileSync(
    path.resolve(import.meta.dirname, '../dist/avatar.html'),
    'utf8'
  );
  assert.match(avatarHtml, /id="heroOrbCanvas"/);
  assert.match(avatarHtml, /id="presetGrid"/);
});
