(() => {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  let promptEvent = null;
  let button;
  const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    if (button) button.hidden = false;
  });
  window.addEventListener('appinstalled', () => { promptEvent = null; if (button) button.remove(); });
  function setup() {
    button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Установить приложение';
    button.className = 'tlc-install-button';
    button.addEventListener('click', async () => {
      if (promptEvent) {
        const pending = promptEvent;
        promptEvent = null;
        await pending.prompt();
        return;
      }
      alert(isApple
        ? 'В Safari нажмите «Поделиться», затем «На экран Домой» и «Добавить».'
        : 'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».');
    });
    const controllerSettings = document.querySelector('#instructions .setup-actions');
    if (controllerSettings) { button.classList.add('tlc-install-inline'); controllerSettings.append(button); }
    else document.body.append(button);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once:true});
  else setup();
})();
