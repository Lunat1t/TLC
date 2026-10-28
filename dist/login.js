import { AVATAR_ROUTE, loadAuthState, signInStudent } from './auth.js';
import { createLiveOrb } from './live-orb.js';

const $ = id => document.getElementById(id);

let storage = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}

const state = loadAuthState(storage);
const canvas = $('loginOrbCanvas');
const orb = canvas ? createLiveOrb(canvas, state.avatar) : null;

if (state.user?.login && $('loginInput')) {
  $('loginInput').value = state.user.login;
}

$('loginOrbStage')?.addEventListener('click', () => {
  orb?.blink();
});

$('loginInput')?.addEventListener('input', event => {
  const len = event.target.value.length;
  const x = Math.min(0.45, Math.max(-0.45, (len - 12) * 0.035));
  orb?.setLook({ x, y: 0.35 });
});

$('loginInput')?.addEventListener('blur', () => {
  orb?.setLook(null);
});

$('passwordInput')?.addEventListener('focus', () => {
  orb?.setLook({ x: 0, y: -0.55, squint: 0.82 });
});

$('passwordInput')?.addEventListener('blur', () => {
  orb?.setLook(null);
});

function showStatus(text, isError = false) {
  const box = $('loginStatus');
  if (!box) return;
  box.textContent = text;
  box.classList.toggle('error', isError);
  box.hidden = false;
}

$('loginForm')?.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const next = signInStudent(storage, {
      login: $('loginInput')?.value,
      password: $('passwordInput')?.value,
    });
    orb?.blink();
    showStatus(`Добро пожаловать, ${next.user.nickname}! Переходим к проектам...`, false);
    setTimeout(() => {
      window.location.assign('index.html');
    }, 550);
  } catch (error) {
    showStatus(error?.message || 'Не удалось выполнить вход.', true);
  }
});

$('registerRedirect')?.addEventListener('click', event => {
  event.preventDefault();
  window.location.assign(AVATAR_ROUTE);
});
