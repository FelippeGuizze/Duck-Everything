'use strict';

/* ═══════════════════════════════════════════════════════
   Duck Everything — Popup Logic v2.1
   ═══════════════════════════════════════════════════════ */

const keys = Object.keys(globalThis.DUCK_DEFAULTS);
const status = document.getElementById('status');

const errorText = e =>
  String(e?.message || e || 'Erro desconhecido')
    .replace(/data:[^\s]+/gi, '[imagem omitida]')
    .replace(/blob:[^\s]+/gi, '[arquivo temporário]')
    .slice(0, 240);

/* Exclude preset, icon and gear buttons from busy lock */
const buttons = [
  ...document.querySelectorAll(
    'button:not(.preset):not(.icon-btn):not(.icon-btn-gear)'
  )
];
const busy = value => buttons.forEach(b => b.disabled = value);

/* ── Show active tab URL in footer ── */
browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  const el = document.getElementById('footer-url');
  if (!el) return;
  try {
    const url = new URL(tab?.url || '');
    el.textContent = url.hostname || tab?.url || '—';
  } catch {
    el.textContent = tab?.url || '—';
  }
}).catch(() => {});

/* ── Show settings ── */
function show(s) {
  keys.forEach(k => {
    const el = document.getElementById(k);
    if (el) el.checked = s[k];
  });
}

/* ── Save ── */
async function save(reload) {
  busy(true);
  try {
    const settings = Object.fromEntries(
      keys.map(k => [k, document.getElementById(k).checked])
    );
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

document.getElementById('btn-settings-footer').onclick = () => switchView('settings');
document.getElementById('btn-back').onclick = () => switchView('main');

/* ═══════════════════════════════════════════════════════
   ACCENT COLOR SYSTEM
   - Detects OS accent color via CSS system keywords
   - Color picker is embedded inside the preview swatch,
     so the popup does NOT close when the native picker opens
   - Remembers last custom color even when "use system" is on
   ═══════════════════════════════════════════════════════ */

const colorHex           = document.getElementById('color-hex');
const useSystemColor     = document.getElementById('use-system-color');
const customColorRow     = document.getElementById('custom-color-row');
const colorPresetsContainer = document.getElementById('color-presets');
const presetButtons      = document.querySelectorAll('.preset');

// Default fallback accent
const FALLBACK_ACCENT = '#7c6ee7';

/* ── Move the <input type="color"> inside the preview div ──
   This way clicking the swatch opens the picker without
   the popup losing focus / closing.                        */
const colorPreview  = document.getElementById('color-preview');
const accentColorInput = document.getElementById('accent-color');
colorPreview.appendChild(accentColorInput);   // move into the swatch

/* ── Detect system accent color ── */
function getSystemAccentColor() {
  const probe = (keyword) => {
    const el = document.createElement('div');
    el.style.cssText = `color:${keyword};position:absolute;visibility:hidden`;
    document.body.appendChild(el);
    const val = getComputedStyle(el).color;
    document.body.removeChild(el);
    return (!val || val.includes(keyword)) ? null : rgbToHex(val);
  };
  return probe('AccentColor') || probe('Highlight') || FALLBACK_ACCENT;
}

function rgbToHex(rgb) {
  const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return FALLBACK_ACCENT;
  return '#' +
    (+m[1]).toString(16).padStart(2, '0') +
    (+m[2]).toString(16).padStart(2, '0') +
    (+m[3]).toString(16).padStart(2, '0');
}

/* ── Apply accent color to all CSS vars ── */
function applyAccent(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-dim', hex + '33');

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lighter = '#' +
    Math.min(255, r + 22).toString(16).padStart(2, '0') +
    Math.min(255, g + 22).toString(16).padStart(2, '0') +
    Math.min(255, b + 22).toString(16).padStart(2, '0');
  root.style.setProperty('--accent-hover', lighter);
  root.style.setProperty('--switch-bg-on', hex);

  // Update swatch and hex label
  colorPreview.style.background = hex;
  if (colorHex) colorHex.textContent = hex;
  accentColorInput.value = hex;

  // Highlight matching preset
  presetButtons.forEach(btn =>
    btn.classList.toggle('active', btn.dataset.color.toLowerCase() === hex.toLowerCase())
  );
}

/* ── Persist / load accent prefs ──
   Structure: { useSystem: bool, customColor: '#rrggbb' }
   customColor is ALWAYS stored, even when useSystem=true,
   so switching back recovers the last chosen color.       */
async function saveAccentPrefs(useSystem, customColor) {
  await browser.storage.local.set({ accentPrefs: { useSystem, customColor } });
}

async function loadAccentPrefs() {
  const res = await browser.storage.local.get('accentPrefs');
  return res.accentPrefs || { useSystem: true, customColor: FALLBACK_ACCENT };
}

/* ── Set picker disabled state ── */
function setPickerEnabled(enabled) {
  if (enabled) {
    customColorRow.classList.remove('disabled');
    colorPresetsContainer.classList.remove('disabled');
  } else {
    customColorRow.classList.add('disabled');
    colorPresetsContainer.classList.add('disabled');
  }
}

/* ── Init ── */
async function initAccentColor() {
  const prefs = await loadAccentPrefs();
  useSystemColor.checked = prefs.useSystem;

  if (prefs.useSystem) {
    applyAccent(getSystemAccentColor());
    setPickerEnabled(false);
  } else {
    applyAccent(prefs.customColor || FALLBACK_ACCENT);
    setPickerEnabled(true);
  }
}

/* ── Toggle system color ── */
useSystemColor.addEventListener('change', async () => {
  const useSystem = useSystemColor.checked;
  // Always read the saved customColor so we don't lose it
  const prefs = await loadAccentPrefs();
  const custom = prefs.customColor || FALLBACK_ACCENT;

  if (useSystem) {
    applyAccent(getSystemAccentColor());
    setPickerEnabled(false);
    // Save useSystem=true, but keep customColor intact
    await saveAccentPrefs(true, custom);
  } else {
    applyAccent(custom);
    setPickerEnabled(true);
    await saveAccentPrefs(false, custom);
  }
});

/* ── Color picker input (native, inside the swatch div) ── */
accentColorInput.addEventListener('input', async () => {
  const hex = accentColorInput.value;
  applyAccent(hex);
  // Save with useSystem=false automatically
  useSystemColor.checked = false;
  setPickerEnabled(true);
  await saveAccentPrefs(false, hex);
});

/* ── Preset buttons ── */
presetButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const hex = btn.dataset.color;
    applyAccent(hex);
    useSystemColor.checked = false;
    setPickerEnabled(true);
    await saveAccentPrefs(false, hex);
  });
});

/* ── Kick off ── */
initAccentColor();
