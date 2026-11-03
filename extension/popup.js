'use strict';

/* ── Tamanho da interface (padrão / ampliado) ── */
const LAYOUT_KEY = 'duckLayout';
const layoutButtons = document.querySelectorAll('.layout-opt');
function applyLayout(mode) {
  const m = mode === 'wide' ? 'wide' : 'compact';
  document.documentElement.dataset.layout = m;
  layoutButtons.forEach(b => {
    const on = b.dataset.layout === m;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
let savedLayout = null;
try { savedLayout = localStorage.getItem(LAYOUT_KEY); } catch {}
applyLayout(savedLayout);
layoutButtons.forEach(b => b.addEventListener('click', () => {
  applyLayout(b.dataset.layout);
  try { localStorage.setItem(LAYOUT_KEY, b.dataset.layout); } catch {}
}));

/* ═══════════════════════════════════════════════════════
   Duck Everything — Popup Logic v2.2
   ═══════════════════════════════════════════════════════ */

const keys = Object.keys(globalThis.DUCK_DEFAULTS);
const status = document.getElementById('status');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const errorText = e =>
  String(e?.message || e || 'Erro desconhecido')
    .replace(/data:[^\s]+/gi, '[imagem omitida]')
    .replace(/blob:[^\s]+/gi, '[arquivo temporário]')
    .slice(0, 240);

/* Exclude preset, icon, gear and layout buttons from busy lock */
const buttons = [
  ...document.querySelectorAll(
    'button:not(.preset):not(.icon-btn):not(.icon-btn-gear):not(.layout-opt)'
  )
];
const busy = value => buttons.forEach(b => b.disabled = value);

/* ── Comunicação com o background com retry para o Chrome ──
   No Chrome, o service worker pode não estar ativo ainda quando o popup
   abre. Tentamos até 4 vezes com 300 ms de intervalo antes de desistir. */
function sendMessage(msg) {
  return browser.runtime.sendMessage(msg);
}

/* ── Show active tab URL in footer with www detection ── */
browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  const el = document.getElementById('footer-url');
  if (!el) return;
  try {
    const url = new URL(tab?.url || '');
    const host = url.hostname;
    if (host && host.startsWith('www.')) {
      const prefix = document.createElement('span');
      prefix.className = 'url-prefix';
      prefix.textContent = 'www.';
      const main = document.createElement('strong');
      main.className = 'url-main';
      main.textContent = host.slice(4);
      el.replaceChildren(prefix, main);
    } else if (host) {
      const main = document.createElement('strong');
      main.className = 'url-main';
      main.textContent = host;
      el.replaceChildren(main);
    } else {
      el.textContent = tab?.title || '—';
    }
  } catch {
    el.textContent = tab?.title || tab?.url || '—';
  }
}).catch(() => {});

/* ── A extensão está ativa nesta aba? ──
   Só vale para páginas abertas DEPOIS de instalar/salvar: o navegador injeta o
   script em navegações novas. O core.js sempre troca Event.prototype.preventDefault
   por uma função anônima; a original se chama "preventDefault". */
const pageState = document.getElementById('page-state');
function setPageState(state, text, title) {
  pageState.dataset.state = state;
  pageState.textContent = text;
  pageState.title = title;
}
browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  if (!tab || !/^(https?|file):/i.test(tab.url || '')) {
    return setPageState('na', 'indisponível', 'O navegador não permite extensões nesta página (ex.: chrome://, about:, loja de extensões).');
  }
  try {
    const [res] = await browser.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN',
      func: () => Event.prototype.preventDefault.name !== 'preventDefault'
    });
    if (res && res.result) setPageState('on', 'ativa nesta aba', 'O Duck Everything já está rodando nesta página.');
    else setPageState('off', 'recarregue a aba', 'A extensão ainda não rodou nesta aba. Recarregue a página (F5). Se continuar assim, confira "Acesso ao site" nos detalhes da extensão.');
  } catch {
    setPageState('na', 'sem acesso', 'A extensão não tem permissão para esta página. Nos detalhes da extensão, defina "Acesso ao site" como "Em todos os sites" (e permita URLs de arquivo se for file://).');
  }
}).catch(() => {});

/* ── Show settings ── */
function show(s) {
  keys.forEach(k => {
    const el = document.getElementById(k);
    if (el) el.checked = s[k];
  });
}

/* Opções ao vivo (DUCK_LIVE) valem na hora para as abas abertas; as outras pedem recarregar. */
const live = new Set(globalThis.DUCK_LIVE);
const labelOf = k => document.getElementById(k).closest('label').querySelector('b').textContent;
keys.filter(k => !live.has(k)).forEach(k => {
  const tag = document.createElement('span');
  tag.className = 'reload-tag';
  tag.textContent = '↻ recarrega a aba';
  tag.title = 'Esta opção só muda depois de recarregar a aba.';
  document.getElementById(k).closest('label').querySelector('b').append(tag);
});
let saved = {};

/* ── Save ── */
async function save(reload) {
  busy(true);
  try {
    const settings = Object.fromEntries(
      keys.map(k => [k, document.getElementById(k).checked])
    );
    await sendMessage({ type: 'save', settings });
    const pending = keys.filter(k => !live.has(k) && settings[k] !== saved[k]);
    saved = settings;
    if (reload) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await browser.tabs.reload(tab.id);
      status.textContent = 'Salvo. Recarregamento solicitado para esta aba.';
    } else if (pending.length) {
      status.textContent = 'Salvo e aplicado nas abas abertas, menos: ' + pending.map(labelOf).join(', ') +
        '. Use "Salvar e recarregar aba" (as outras abas, F5).';
      busy(false);
      return;
    } else {
      status.textContent = 'Salvo e aplicado nas abas abertas.';
    }
    setTimeout(() => window.close(), 250);
  } catch (e) {
    status.textContent = 'Não foi possível concluir: ' + errorText(e);
    busy(false);
  }
}

document.getElementById('save').onclick = () => save(false);
document.getElementById('reload').onclick = () => save(true);
document.getElementById('reset').onclick = () => {
  show(globalThis.DUCK_DEFAULTS);
  status.textContent = 'Padrão restaurado. Clique em Salvar para aplicar.';
};
document.getElementById('disable-all').onclick = () => {
  show(Object.fromEntries(keys.map(k => [k, false])));
  status.textContent = 'Tudo desmarcado. Clique em Salvar para aplicar.';
};

/* ── Capture ── */
const copyToggle = document.getElementById('capture-copy');
browser.storage.local.get('capturePrefs').then(r => { copyToggle.checked = !!r.capturePrefs?.copy; }).catch(() => {});
copyToggle.addEventListener('change', () =>
  browser.storage.local.set({ capturePrefs: { copy: copyToggle.checked } }).catch(() => {}));

async function copyPng(dataUrl) {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), c => c.charCodeAt(0));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
}

async function takeCapture(saveAs) {
  busy(true);
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) throw new Error('Nenhuma aba disponível.');
    status.textContent = 'Preparando PNG da área visível…';
    let png, copyError;
    if (copyToggle.checked) {
      // Copia antes de pedir o arquivo: o "Salvar como" fecha o popup.
      const shot = await sendMessage({ type: 'shot', tabId: tab.id });
      if (!shot?.ok) throw new Error(shot?.error || 'Captura não concluída.');
      png = shot.png;
      try { await copyPng(png); } catch (e) { copyError = e; }
    }
    sendMessage({ type: 'capture', tabId: tab.id, saveAs, png });
    if (copyError) {
      status.textContent = 'PNG enviado para salvar, mas não foi possível copiar: ' + errorText(copyError);
      busy(false);
      return;
    }
    setTimeout(() => window.close(), 250);
  } catch (e) {
    status.textContent = 'Captura não concluída: ' + errorText(e);
    busy(false);
  }
}

document.getElementById('capture').onclick = () => takeCapture(true);
document.getElementById('capture-quick').onclick = () => takeCapture(false);

/* ── Load settings ── */
busy(true);
sendMessage({ type: 'get' }).then(({ settings }) => {
  show(settings);
  saved = settings;
  status.textContent = 'Salvar aplica na hora; opções com ↻ pedem recarregar a aba.';
  busy(false);
}).catch(e => {
  status.textContent = 'Falha ao carregar: ' + errorText(e);
  busy(false);
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
   ═══════════════════════════════════════════════════════ */

const colorHex = document.getElementById('color-hex');
const useSystemColor = document.getElementById('use-system-color');
const customColorRow = document.getElementById('custom-color-row');
const colorPresetsContainer = document.getElementById('color-presets');
const presetButtons = document.querySelectorAll('.preset');

const FALLBACK_ACCENT = '#7c6ee7';

const colorPreview = document.getElementById('color-preview');
const accentColorInput = document.getElementById('accent-color');
colorPreview.appendChild(accentColorInput);

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

  colorPreview.style.background = hex;
  if (colorHex) colorHex.textContent = hex;
  accentColorInput.value = hex;

  presetButtons.forEach(btn =>
    btn.classList.toggle('active', btn.dataset.color.toLowerCase() === hex.toLowerCase())
  );
}

async function saveAccentPrefs(useSystem, customColor) {
  await browser.storage.local.set({ accentPrefs: { useSystem, customColor } });
}

async function loadAccentPrefs() {
  const res = await browser.storage.local.get('accentPrefs');
  return res.accentPrefs || { useSystem: true, customColor: FALLBACK_ACCENT };
}

function setPickerEnabled(enabled) {
  if (enabled) {
    customColorRow.classList.remove('disabled');
    colorPresetsContainer.classList.remove('disabled');
  } else {
    customColorRow.classList.add('disabled');
    colorPresetsContainer.classList.add('disabled');
  }
}

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

useSystemColor.addEventListener('change', async () => {
  const useSystem = useSystemColor.checked;
  const prefs = await loadAccentPrefs();
  const custom = prefs.customColor || FALLBACK_ACCENT;

  if (useSystem) {
    applyAccent(getSystemAccentColor());
    setPickerEnabled(false);
    await saveAccentPrefs(true, custom);
  } else {
    applyAccent(custom);
    setPickerEnabled(true);
    await saveAccentPrefs(false, custom);
  }
});

accentColorInput.addEventListener('input', async () => {
  const hex = accentColorInput.value;
  applyAccent(hex);
  useSystemColor.checked = false;
  setPickerEnabled(true);
  await saveAccentPrefs(false, hex);
});

presetButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const hex = btn.dataset.color;
    applyAccent(hex);
    useSystemColor.checked = false;
    setPickerEnabled(true);
    await saveAccentPrefs(false, hex);
  });
});

initAccentColor();
