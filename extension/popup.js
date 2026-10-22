'use strict';

/* ═══════════════════════════════════════════════════════
   Duck Everything — Popup Logic
   ═══════════════════════════════════════════════════════ */

const keys = Object.keys(globalThis.DUCK_DEFAULTS);
const status = document.getElementById('status');

const errorText = e =>
  String(e?.message || e || 'Erro desconhecido')
    .replace(/data:[^\s]+/gi, '[imagem omitida]')
    .replace(/blob:[^\s]+/gi, '[arquivo temporário]')
    .slice(0, 240);

const buttons = [...document.querySelectorAll('button:not(.preset):not(.icon-btn):not(.icon-btn-sm)')];
const busy = value => buttons.forEach(b => b.disabled = value);

/* ── Version tag ── */
const manifest = browser.runtime.getManifest();
const versionTag = document.getElementById('version-tag');
const infoVersion = document.getElementById('info-version');
if (versionTag) versionTag.textContent = 'v' + manifest.version;
if (infoVersion) infoVersion.textContent = manifest.version;

/* ── Toggle dots sync ── */
function syncDots() {
  // Master dot
  const masterDot = document.getElementById('master-dot');
  const enabledCb = document.getElementById('enabled');
  if (masterDot && enabledCb) {
    masterDot.classList.toggle('on', enabledCb.checked);
  }
  // Option dots
  document.querySelectorAll('.options-list .row').forEach(row => {
    const cb = row.querySelector('input[type="checkbox"]');
    const dot = row.querySelector('.toggle-dot');
    if (cb && dot) {
      dot.classList.toggle('on', cb.checked);
    }
  });
}

/* ── Show settings ── */
function show(s) {
  keys.forEach(k => {
    const el = document.getElementById(k);
    if (el) el.checked = s[k];
  });
  syncDots();
}

/* ── Listen for checkbox changes to sync dots ── */
document.querySelectorAll('input[type="checkbox"][role="switch"]').forEach(cb => {
  cb.addEventListener('change', syncDots);
});

/* ── Save ── */
async function save(reload) {
  busy(true);
  try {
    const settings = Object.fromEntries(keys.map(k => [k, document.getElementById(k).checked]));
    await browser.runtime.sendMessage({ type: 'save', settings });
    status.textContent = 'Salvo. Recarregue as abas abertas para aplicar.';
    if (reload) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await browser.tabs.reload(tab.id);
      status.textContent = 'Salvo. Recarregamento solicitado para esta aba.';
    }
  } catch (e) {
    status.textContent = 'Não foi possível concluir: ' + errorText(e);
  } finally {
    busy(false);
  }
}

document.getElementById('save').onclick = () => save(false);
document.getElementById('reload').onclick = () => save(true);
document.getElementById('reset').onclick = () => {
  show(globalThis.DUCK_DEFAULTS);
  status.textContent = 'Tudo selecionado. Clique em Salvar para aplicar.';
};
document.getElementById('disable-all').onclick = () => {
  show(Object.fromEntries(keys.map(k => [k, false])));
  status.textContent = 'Tudo desmarcado. Clique em Salvar para aplicar.';
};

/* ── Capture ── */
async function takeCapture(saveAs) {
  busy(true);
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) throw new Error('Nenhuma aba disponível.');
    status.textContent = 'Preparando PNG da área visível…';
    const result = await browser.runtime.sendMessage({ type: 'capture', tabId: tab.id, saveAs });
    if (!result.ok) throw new Error(result.error);
    status.textContent = saveAs
      ? 'PNG encaminhado para salvamento.'
      : 'Download do PNG iniciado na pasta padrão.';
  } catch (e) {
    status.textContent = 'Captura não concluída: ' + errorText(e);
  } finally {
    busy(false);
  }
}

document.getElementById('capture').onclick = () => takeCapture(true);
document.getElementById('capture-quick').onclick = () => takeCapture(false);

/* ── Load settings ── */
busy(true);
browser.runtime.sendMessage({ type: 'get' }).then(({ settings }) => {
  show(settings);
  status.textContent = 'Salve para aplicar nas próximas páginas.';
  busy(false);
}).catch(e => {
  status.textContent = 'Falha ao carregar: ' + errorText(e);
});

/* ═══════════════════════════════════════════════════════
   VIEW NAVIGATION (Main ↔ Settings)
   ═══════════════════════════════════════════════════════ */

const viewMain = document.getElementById('view-main');
const viewSettings = document.getElementById('view-settings');

function switchView(target) {
  viewMain.classList.toggle('active', target === 'main');
  viewSettings.classList.toggle('active', target === 'settings');
}

document.getElementById('btn-settings').onclick = () => switchView('settings');
document.getElementById('btn-settings-footer').onclick = () => switchView('settings');
document.getElementById('btn-back').onclick = () => switchView('main');

/* ═══════════════════════════════════════════════════════
   ACCENT COLOR SYSTEM
   Detects OS accent color and allows custom override.
   ═══════════════════════════════════════════════════════ */

const accentColorInput = document.getElementById('accent-color');
const colorPreview = document.getElementById('color-preview');
const colorHex = document.getElementById('color-hex');
const useSystemColor = document.getElementById('use-system-color');
const customColorRow = document.getElementById('custom-color-row');
const colorPresetsContainer = document.getElementById('color-presets');
const presetButtons = document.querySelectorAll('.preset');

// Default fallback accent
const FALLBACK_ACCENT = '#7c6ee7';

/* ── Detect system accent color ── */
function getSystemAccentColor() {
  // Try to read the CSS system accent color
  const test = document.createElement('div');
  test.style.color = 'AccentColor';
  document.body.appendChild(test);
  const computed = getComputedStyle(test).color;
  document.body.removeChild(test);

  // If the browser supports AccentColor, computed will be an rgb() value
  if (computed && computed !== '' && !computed.includes('AccentColor')) {
    return rgbToHex(computed);
  }

  // Fallback: try the CSS highlight color
  const test2 = document.createElement('div');
  test2.style.color = 'Highlight';
  document.body.appendChild(test2);
  const computed2 = getComputedStyle(test2).color;
  document.body.removeChild(test2);

  if (computed2 && computed2 !== '' && !computed2.includes('Highlight')) {
    return rgbToHex(computed2);
  }

  return FALLBACK_ACCENT;
}

function rgbToHex(rgb) {
  const match = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return FALLBACK_ACCENT;
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return '#' + r + g + b;
}

/* ── Apply accent color to CSS ── */
function applyAccent(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-dim', hex + '33');

  // Compute a lighter variant for hover
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lighter = '#' +
    Math.min(255, r + 20).toString(16).padStart(2, '0') +
    Math.min(255, g + 20).toString(16).padStart(2, '0') +
    Math.min(255, b + 20).toString(16).padStart(2, '0');
  root.style.setProperty('--accent-hover', lighter);

  // Update switch on color
  root.style.setProperty('--switch-bg-on', hex);

  // Update previews
  if (colorPreview) colorPreview.style.background = hex;
  if (colorHex) colorHex.textContent = hex;
  if (accentColorInput) accentColorInput.value = hex;

  // Update active preset
  presetButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === hex);
  });
}

/* ── Save/load accent preferences ── */
async function saveAccentPrefs(useSystem, customColor) {
  await browser.storage.local.set({
    accentPrefs: { useSystem, customColor }
  });
}

async function loadAccentPrefs() {
  const result = await browser.storage.local.get('accentPrefs');
  return result.accentPrefs || { useSystem: true, customColor: FALLBACK_ACCENT };
}

/* ── Initialize accent color ── */
async function initAccentColor() {
  const prefs = await loadAccentPrefs();
  const systemColor = getSystemAccentColor();

  useSystemColor.checked = prefs.useSystem;

  if (prefs.useSystem) {
    applyAccent(systemColor);
    customColorRow.classList.add('disabled');
    colorPresetsContainer.classList.add('disabled');
  } else {
    applyAccent(prefs.customColor || FALLBACK_ACCENT);
    customColorRow.classList.remove('disabled');
    colorPresetsContainer.classList.remove('disabled');
  }
}

/* ── Event: toggle system color ── */
useSystemColor.addEventListener('change', async () => {
  const useSystem = useSystemColor.checked;
  if (useSystem) {
    const systemColor = getSystemAccentColor();
    applyAccent(systemColor);
    customColorRow.classList.add('disabled');
    colorPresetsContainer.classList.add('disabled');
    await saveAccentPrefs(true, accentColorInput.value);
  } else {
    customColorRow.classList.remove('disabled');
    colorPresetsContainer.classList.remove('disabled');
    const prefs = await loadAccentPrefs();
    applyAccent(prefs.customColor || FALLBACK_ACCENT);
    await saveAccentPrefs(false, prefs.customColor || FALLBACK_ACCENT);
  }
});

/* ── Event: color picker ── */
colorPreview.addEventListener('click', () => {
  if (!useSystemColor.checked) accentColorInput.click();
});

accentColorInput.addEventListener('input', async () => {
  const hex = accentColorInput.value;
  applyAccent(hex);
  await saveAccentPrefs(false, hex);
});

/* ── Event: preset buttons ── */
presetButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    if (useSystemColor.checked) return;
    const hex = btn.dataset.color;
    applyAccent(hex);
    await saveAccentPrefs(false, hex);
  });
});

/* ── Init ── */
initAccentColor();
