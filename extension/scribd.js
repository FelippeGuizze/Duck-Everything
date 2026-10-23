(() => {
  'use strict';
  // Limpa o texto copiado em scribd.com: reconstrói quebras de linha/parágrafo
  // pela posição real das palavras na tela e copia só texto puro (sem HTML).
  // IMPORTANTE: precisa carregar ANTES do core.js (ver background.js), para
  // registrar o listener antes dele e guardar o preventDefault original.

  const INVISIBLE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;
  const ODD_SPACES = /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g;
  const clean = s => s.normalize('NFC').replace(INVISIBLE, '').replace(ODD_SPACES, ' ');
  const tidy = s => s.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  // words: [{t, l, r, top, bottom, sp}] na ordem do DOM
  function layoutToText(words) {
    let out = '';
    let prev = null;
    for (const w of words) {
      const t = clean(w.t);
      if (!t) continue;
      if (prev) {
        const ph = prev.bottom - prev.top;
        const h = w.bottom - w.top;
        const hm = Math.min(ph, h) || 1;
        const dy = (w.top + w.bottom) / 2 - (prev.top + prev.bottom) / 2;
        const sameLine = Math.abs(dy) <= hm * 0.5;
        let sep;
        if (sameLine && w.l >= prev.r - hm * 0.5) sep = (w.sp || w.l - prev.r > hm * 0.1) ? ' ' : '';
        else if (sameLine) sep = '\n';
        else if (dy < 0 || dy > hm * 1.65) sep = '\n\n';
        else sep = '\n';
        out += sep;
      }
      out += t;
      prev = w;
    }
    return tidy(out);
  }

  if (typeof module === 'object' && module.exports) module.exports = { layoutToText, clean, tidy };

  const cfg = globalThis.__duck_boot_config__;
  if (!cfg || !cfg.scribd) return;
  if (!/(^|\.)scribd\.com$/i.test(location.hostname)) return;

  const MAX_WORDS = 60000;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const nativePrevent = Event.prototype.preventDefault;
  const nativeStop = Event.prototype.stopImmediatePropagation;


  // ---------- decodificação das fontes embaralhadas (ff0, ff1, ...) ----------
  // O Scribd troca os caracteres no DOM e a fonte do documento desenha o glifo
  // certo. Desenhamos cada caractere com a fonte do documento num canvas e
  // achamos a letra real comparando com fontes de referência.
  const FONT_RE = /^ff[0-9a-f]+$/i;
  const REFS = ['"Courier New"', 'Consolas', '"Times New Roman"', 'Georgia', 'Arial',
                'Calibri', 'Verdana', 'monospace', 'serif', 'sans-serif'];
  const CAND = [...Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)),
                ...'ÀÁÂÃÄÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜàáâãäçèéêëìíîïñòóôõöùúûüªº“”‘’–—•…€', 'ﬁ', 'ﬂ'];
  const CAND_OUT = { 'ﬁ': 'fi', 'ﬂ': 'fl' };
  const SZ = 96, N = 32, BLANK_INK = 0.5;
  const famCache = new WeakMap();
  const fontState = new Map(); // família -> {chars, combo, map}
  const refCache = new Map();  // combo -> vetores unitários dos candidatos
  let cx = null;

  function fontOf(el) {
    if (!el) return '';
    let f = famCache.get(el);
    if (f === undefined) {
      f = (getComputedStyle(el).fontFamily.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
      if (!FONT_RE.test(f)) f = '';
      famCache.set(el, f);
    }
    return f;
  }
  function smooth(g) { // [1,2,1] separável, duas passadas
    const t = new Float32Array(N * N);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        t[y * N + x] = (g[y * N + Math.max(0, x - 1)] + 2 * g[y * N + x] + g[y * N + Math.min(N - 1, x + 1)]) / 4;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        g[y * N + x] = (t[Math.max(0, y - 1) * N + x] + 2 * t[y * N + x] + t[Math.min(N - 1, y + 1) * N + x]) / 4;
    }
    return g;
  }
  function render(font, ch) {
    if (!cx) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = SZ;
      cx = cv.getContext('2d', { willReadFrequently: true });
    }
    cx.clearRect(0, 0, SZ, SZ);
    cx.font = font; cx.textBaseline = 'alphabetic'; cx.fillStyle = '#000';
    cx.fillText(ch, 16, 64);
    const d = cx.getImageData(0, 0, SZ, SZ).data;
    const g = new Float32Array(N * N);
    const k = SZ / N;
    for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++)
      g[((y / k) | 0) * N + ((x / k) | 0)] += d[(y * SZ + x) * 4 + 3] / (255 * k * k);
    return smooth(g);
  }
  const ink = g => g.reduce((a, b) => a + b, 0);
  function unit(g) {
    let s = 0;
    for (let i = 0; i < g.length; i++) s += g[i] * g[i];
    s = Math.sqrt(s);
    return s < 1e-6 ? null : g.map(v => v / s);
  }
  const dist = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return 1 - d; };
  function nearest(u, cands) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < cands.length; i++) {
      if (!cands[i]) continue;
      const d = dist(u, cands[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    return { i: bi, d: bd };
  }
  const comboStr = (style, weight, fam) => `${style} ${weight} 64px ${fam}`;
  function refVecs(combo) {
    let r = refCache.get(combo);
    if (!r) { r = CAND.map(c => unit(render(combo, c))); refCache.set(combo, r); }
    return r;
  }
  function chooseCombo(fam, sample) {
    const own = `normal normal 64px "${fam}"`;
    const targets = [];
    for (const ch of sample) { const g = render(own, ch); if (ink(g) >= BLANK_INK) targets.push(unit(g)); }
    if (!targets.length) return null;
    const score = combo => {
      const rv = refVecs(combo);
      let t = 0;
      for (const u of targets) t += nearest(u, rv).d;
      return t / targets.length;
    };
    let bestFam = null, best = Infinity;
    for (const f of REFS) { const s = score(comboStr('normal', 'normal', f)); if (s < best) { best = s; bestFam = f; } }
    let bestCombo = comboStr('normal', 'normal', bestFam);
    for (const st of ['normal', 'italic']) for (const wt of ['normal', 'bold']) {
      const c = comboStr(st, wt, bestFam);
      const s = score(c);
      if (s < best - 0.005) { best = s; bestCombo = c; }
    }
    return bestCombo;
  }
  function decodeChar(fam, ch, rv) {
    const g = render(`normal normal 64px "${fam}"`, ch);
    if (ink(g) < BLANK_INK) return ' ';
    const u = unit(g);
    const { i, d } = nearest(u, rv);
    const idx = CAND.indexOf(ch);
    if (idx >= 0 && rv[idx] && dist(u, rv[idx]) <= d + 0.06) return ch; // já era o caractere certo
    if (ch === '=' && (CAND[i] === '#' || CAND[i] === '=')) return '='; // impede falso positivo onde '=' casa com barras de '#'
    return CAND_OUT[CAND[i]] || CAND[i];
  }
  function resolveFont(fam, chars) {
    if (!document.fonts.check(`64px "${fam}"`)) return null;
    let st = fontState.get(fam);
    if (!st) { st = { chars: new Set(), combo: null, map: new Map() }; fontState.set(fam, st); }
    let grew = false;
    for (const c of chars) if (!st.chars.has(c)) { st.chars.add(c); grew = true; }
    if (!st.combo || (grew && st.chars.size <= 60)) {
      const combo = chooseCombo(fam, [...st.chars].slice(0, 40));
      if (combo && combo !== st.combo) { st.combo = combo; st.map.clear(); }
    }
    if (!st.combo) return null;
    const rv = refVecs(st.combo);
    for (const c of st.chars) if (!st.map.has(c)) st.map.set(c, decodeChar(fam, c, rv));
    return st.map;
  }
  function decodeWords(words) {
    const byFont = new Map();
    for (const w of words) if (w.f) {
      let s = byFont.get(w.f);
      if (!s) byFont.set(w.f, s = new Set());
      for (const ch of w.t) s.add(ch);
    }
    if (!byFont.size) return;
    const maps = new Map();
    for (const [f, set] of byFont) { try { const m = resolveFont(f, set); if (m) maps.set(f, m); } catch { /* ignora */ } }
    for (const w of words) {
      const m = w.f && maps.get(w.f);
      if (m) w.t = Array.from(w.t, ch => m.get(ch) ?? ch).join('');
    }
  }

  // ---------- depuração (console da página) e captura das fontes ----------
  const captured = [];
  try {
    const Orig = globalThis.FontFace;
    if (Orig) globalThis.FontFace = new Proxy(Orig, {
      construct(t, args, nt) {
        try { if (captured.length < 60) captured.push({ family: String(args[0]), source: args[1] }); } catch { /* ignora */ }
        return Reflect.construct(t, args, nt);
      }
    });
  } catch { /* ignora */ }
  globalThis.duckScribd = {
    maps: () => Object.fromEntries([...fontState].map(([f, s]) => [f, { combo: s.combo, map: Object.fromEntries(s.map) }])),
    fonts: () => captured.map((c, i) => ({ i, family: c.family, tipo: typeof c.source === 'string' ? 'url/string' : (c.source && c.source.constructor && c.source.constructor.name) })),
    download(i) {
      const s = captured[i] && captured[i].source;
      if (!s) return 'sem fonte';
      if (typeof s === 'string') return s.slice(0, 300);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([s]));
      a.download = captured[i].family + '.font';
      a.click();
      return 'ok';
    }
  };

  function collectWords(sel) {
    const words = [];
    const tmp = document.createRange();
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      let root = range.commonAncestorContainer;
      if (root.nodeType === Node.TEXT_NODE) root = root.parentNode;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: n => n.parentElement && !SKIP.has(n.parentElement.tagName) && range.intersectsNode(n)
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const start = n === range.startContainer ? range.startOffset : 0;
        const end = n === range.endContainer ? range.endOffset : n.data.length;
        const text = n.data.slice(start, end);
        const re = /[^ \t\r\n\f]+/g;
        let m;
        while ((m = re.exec(text))) {
          tmp.setStart(n, start + m.index);
          tmp.setEnd(n, start + m.index + m[0].length);
          const r = tmp.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue; // texto oculto
          words.push({ t: m[0], l: r.left, r: r.right, top: r.top, bottom: r.bottom,
                       sp: m.index > 0 && /[ \t\r\n\f]/.test(text[m.index - 1]),
                       f: fontOf(n.parentElement) });
          if (words.length > MAX_WORDS) return null;
        }
      }
    }
    return words;
  }

  window.addEventListener('copy', e => {
    try {
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return;
      const words = collectWords(sel);
      if (words && words.length) { try { decodeWords(words); } catch { /* segue sem decodificar */ } }
      const text = words && words.length ? layoutToText(words) : tidy(clean(sel.toString()));
      if (!text) return;
      e.clipboardData.setData('text/plain', text);
      nativePrevent.call(e);
      nativeStop.call(e); // impede handlers do Scribd de sobrescrever o clipboard
    } catch { /* em caso de erro, deixa a cópia nativa seguir */ }
  }, true);
})();
