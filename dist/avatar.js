import { loadAuthState, saveAvatarChoice } from './auth.js';
import { AVATAR_PRESETS, createLiveOrb } from './live-orb.js';

const $ = id => document.getElementById(id);

let storage = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}

const initialState = loadAuthState(storage);
let selectedAvatar = {
  ...initialState.avatar,
};

if (initialState.user?.nickname && $('nicknameInput')) {
  $('nicknameInput').value = initialState.user.nickname;
}

const heroCanvas = $('heroOrbCanvas');
const heroOrb = heroCanvas ? createLiveOrb(heroCanvas, selectedAvatar) : null;

function syncControlsFromSelection() {
  if ($('activeOrbTitle')) {
    $('activeOrbTitle').textContent = selectedAvatar.name || 'Live Orb';
  }
  if ($('bodyColorInput') && selectedAvatar.color) {
    $('bodyColorInput').value = selectedAvatar.color;
  }
  if ($('eyeColorInput') && selectedAvatar.eyeColor) {
    $('eyeColorInput').value = selectedAvatar.eyeColor;
  }
  if ($('shaderModeSelect') && selectedAvatar.variant) {
    $('shaderModeSelect').value = selectedAvatar.variant;
  }
  heroOrb?.setOptions(selectedAvatar);

  const tiles = document.querySelectorAll('.preset-tile');
  for (const tile of tiles) {
    tile.setAttribute('aria-pressed', String(tile.dataset.presetId === selectedAvatar.presetId));
  }
}

function renderPresetGrid() {
  const grid = $('presetGrid');
  if (!grid) return;
  grid.replaceChildren();

  for (const preset of AVATAR_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-tile';
    button.dataset.presetId = preset.id;
    button.setAttribute('aria-pressed', String(preset.id === selectedAvatar.presetId));

    const miniCanvas = document.createElement('canvas');
    miniCanvas.className = 'preset-mini-canvas';
    miniCanvas.width = 144;
    miniCanvas.height = 144;
    miniCanvas.setAttribute('aria-hidden', 'true');

    const title = document.createElement('span');
    title.className = 'preset-name';
    title.textContent = preset.name;

    const badge = document.createElement('span');
    badge.className = 'preset-badge';
    badge.textContent = preset.badge;

    button.append(miniCanvas, title, badge);
    button.addEventListener('click', () => {
      selectedAvatar = {
        presetId: preset.id,
        name: preset.name,
        variant: preset.variant,
        color: preset.color,
        eyeColor: preset.eyeColor,
        colors: [...preset.colors],
      };
      syncControlsFromSelection();
      heroOrb?.blink();
    });

    grid.append(button);
    createLiveOrb(miniCanvas, preset);
  }
}

renderPresetGrid();
syncControlsFromSelection();

$('heroOrbStage')?.addEventListener('click', () => heroOrb?.blink());
$('blinkNowBtn')?.addEventListener('click', () => heroOrb?.blink());

$('bodyColorInput')?.addEventListener('input', event => {
  const color = event.target.value;
  selectedAvatar = {
    ...selectedAvatar,
    presetId: 'custom',
    name: 'Свой Live Orb',
    variant: $('shaderModeSelect')?.value === 'webgl' ? 'webgl' : 'custom',
    color,
    colors: [color, selectedAvatar.colors?.[1] || '#7DD3C7', selectedAvatar.colors?.[2] || '#E8B4D4'],
  };
  syncControlsFromSelection();
});

$('eyeColorInput')?.addEventListener('input', event => {
  selectedAvatar = {
    ...selectedAvatar,
    eyeColor: event.target.value,
  };
  syncControlsFromSelection();
});

$('shaderModeSelect')?.addEventListener('change', event => {
  selectedAvatar = {
    ...selectedAvatar,
    variant: event.target.value,
  };
  syncControlsFromSelection();
});

$('avatarForm')?.addEventListener('submit', event => {
  event.preventDefault();
  const saved = saveAvatarChoice(storage, {
    ...selectedAvatar,
    nickname: $('nicknameInput')?.value,
  });
  heroOrb?.blink();
  const status = $('avatarStatus');
  if (status) {
    status.textContent = `Аватар «${saved.avatar.name}» сохранён! Переходим ко входу...`;
    status.classList.remove('error');
    status.hidden = false;
  }
  setTimeout(() => {
    window.location.assign('login.html');
  }, 550);
});
