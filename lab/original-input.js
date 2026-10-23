/**
 * Duck Everything — Laboratório de Testes
 * original-input.js: Simula um site restritivo/hostil que tenta bloquear
 * cópia, colagem, botão direito, teclas de atalho, foco e histórico.
 */

(() => {
  'use strict';

  // 1. Bloqueio de Menu de Contexto (botão direito)
  document.addEventListener('contextmenu', e => {
    e.preventDefault();
  }, false);

  // 2. Bloqueio de Eventos de Clipboard
  ['copy', 'cut', 'paste'].forEach(type => {
    document.addEventListener(type, e => {
      e.preventDefault();
    }, false);
  });

  // 3. Bloqueio de Seleção e Arrastar
  ['selectstart', 'dragstart'].forEach(type => {
    document.addEventListener(type, e => {
      e.preventDefault();
    }, false);
  });

  // 4. Bloqueio de Teclas de Atalho (Teclado)
  document.addEventListener('keydown', e => {
    const key = (e.key || '').toLowerCase();

    // F5 ou Ctrl+R (recarregar)
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && key === 'r')) {
      e.preventDefault();
    }

    // Ctrl+C (copiar) e Ctrl+X (recortar)
    if ((e.ctrlKey || e.metaKey) && (key === 'c' || key === 'x')) {
      e.preventDefault();
    }

    // Ctrl+V (colar)
    if ((e.ctrlKey || e.metaKey) && key === 'v') {
      e.preventDefault();
    }

    // Ctrl+U (ver código fonte)
    if ((e.ctrlKey || e.metaKey) && key === 'u') {
      e.preventDefault();
    }

    // Ctrl+Shift+I / F12 (DevTools)
    if (e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'i')) {
      e.preventDefault();
    }

    // F11 (tela cheia)
    if (e.key === 'F11') {
      e.preventDefault();
    }

    // Escape (corrigido: 'Escape' no padrão DOM, não 'ESC')
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
    }
  }, false);

  // 5. Armadilha de Histórico (impede voltar da página)
  try {
    history.pushState({ page: 1 }, '', location.href);
    window.addEventListener('popstate', () => {
      // Tenta re-empurrar para prender o usuário na página
      history.pushState({ page: 1 }, '', location.href);
    });
  } catch {}

  // 6. Monitoramento de Foco / Troca de Aba (simula sistema anti-cola / proctoring)
  window.__hostileTabEscapes = 0;
  window.addEventListener('blur', () => {
    window.__hostileTabEscapes++;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' || document.hidden) {
      window.__hostileTabEscapes++;
    }
  });

})();
