const storageKey = 'ragnarok-atlas:save-directly';
let saveDirectly = true;
try {
  saveDirectly = localStorage.getItem(storageKey) !== 'false';
} catch {
  // Keep the setting usable for this page when browser storage is unavailable.
}

export function isDirectSaveEnabled() {
  return saveDirectly;
}

const dialog = document.querySelector('#settings-dialog');
const checkbox = document.querySelector('#save-directly');
const status = document.querySelector('#settings-status');

function renderSetting() {
  if (checkbox) checkbox.checked = saveDirectly;
  const hint = document.querySelector('#builder-save-hint');
  if (hint) hint.textContent = saveDirectly
    ? 'Direct saving is enabled in Settings. A successful build saves each populated table to search-app/lib/, replacing its previous file. Empty tables leave existing files untouched. Downloads remain available.'
    : 'Direct saving is disabled in Settings. Builds will not write to search-app/lib/. Use the download buttons to save your generated tables.';
  const footer = document.querySelector('#builder-storage-note');
  if (footer) footer.textContent = saveDirectly
    ? 'Direct saving to search-app/lib/ is enabled.'
    : 'Direct saving is disabled. Download your built tables.';
}

document.querySelector('#open-settings')?.addEventListener('click', () => dialog.showModal());
document.querySelector('#close-settings')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
checkbox?.addEventListener('change', () => {
  saveDirectly = checkbox.checked;
  renderSetting();
  try {
    localStorage.setItem(storageKey, String(saveDirectly));
    status.textContent = 'Setting saved in this browser. It applies to your next build.';
  } catch {
    status.textContent = 'Setting applied for this page only. Browser storage is unavailable, so it cannot be remembered after a reload.';
  }
});
window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== null) return;
  saveDirectly = event.newValue !== 'false';
  renderSetting();
});
renderSetting();
