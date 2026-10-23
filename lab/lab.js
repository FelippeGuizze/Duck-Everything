/**
 * Duck Everything — Laboratório de Testes
 * lab.js: Monitoramento em tempo real, captura de teclas do usuário e testes interativos.
 */

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const logBox = document.getElementById('log');

  function pad(n) { return String(n).padStart(2, '0'); }
  function timestamp() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }

  function appendLog(category, msg, statusType = 'info') {
    const el = document.getElementById('log');
    if (!el) return;
    const time = timestamp();
    const line = `[${time}] [${category.toUpperCase()}] ${msg}\n`;
    el.textContent += line;
    el.scrollTop = el.scrollHeight;
  }

  // ═══════════════════════════════════════════════════════
  // 1. MONITORAMENTO REAL DO TECLADO (TODAS AS TECLAS)
  // ═══════════════════════════════════════════════════════

  window.addEventListener('keydown', e => {
    try {
      const modifiers = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.altKey) modifiers.push('Alt');
      if (e.metaKey) modifiers.push('Meta/Cmd');

      const modStr = modifiers.length ? ` + [${modifiers.join('+')}]` : '';
      const status = e.defaultPrevented ? '❌ BLOQUEADO (preventDefault = true)' : '✅ LIBERADO (preventDefault = false)';

      appendLog('TECLADO', `Tecla: "${e.key}" (código: ${e.code})${modStr} | ${status}`, e.defaultPrevented ? 'error' : 'success');
    } catch (err) {
      console.error('Erro no listener de keydown:', err);
    }
  }, true);

  // ═══════════════════════════════════════════════════════
  // 2. MONITORAMENTO DE ÁREA DE TRANSFERÊNCIA E MOUSE
  // ═══════════════════════════════════════════════════════

  ['copy', 'cut', 'paste'].forEach(type => {
    document.addEventListener(type, e => {
      try {
        const status = e.defaultPrevented ? '❌ BLOQUEADO pelo site' : '✅ LIBERADO pelo navegador';
        appendLog('CLIPBOARD', `Evento "${type}" acionado | ${status}`, e.defaultPrevented ? 'error' : 'success');
      } catch (err) {
        console.error(err);
      }
    }, true);
  });

  document.addEventListener('contextmenu', e => {
    try {
      const status = e.defaultPrevented ? '❌ BLOQUEADO pelo site' : '✅ LIBERADO pelo navegador (menu de contexto deve abrir)';
      appendLog('MOUSE', `Clique com botão direito (contextmenu) | ${status}`, e.defaultPrevented ? 'error' : 'success');
    } catch (err) {
      console.error(err);
    }
  }, true);

  // ═══════════════════════════════════════════════════════
  // 3. MONITORAMENTO DE FOCO E VISIBILIDADE
  // ═══════════════════════════════════════════════════════

  window.addEventListener('blur', () => {
    appendLog('FOCO', 'Evento "blur" recebido pela janela (perdeu foco)', 'warn');
  }, true);

  window.addEventListener('focus', () => {
    appendLog('FOCO', 'Evento "focus" recebido pela janela (ganhou foco)', 'info');
  }, true);

  document.addEventListener('visibilitychange', () => {
    try {
      appendLog('VISIBILIDADE', `visibilityState mudou para: "${document.visibilityState}" (hidden: ${document.hidden})`, 'info');
    } catch (err) {
      console.error(err);
    }
  }, true);

  document.addEventListener('fullscreenchange', () => {
    appendLog('FULLSCREEN', `fullscreenchange disparado! fullscreenElement=${!!document.fullscreenElement}`, 'info');
    updateStatus();
  });

  // ═══════════════════════════════════════════════════════
  // 4. ATUALIZAÇÃO DO PAINEL DE STATUS EM TEMPO REAL
  // ═══════════════════════════════════════════════════════

  function updateStatus() {
    try {
      // 1. Fullscreen element (simulado ou nativo)
      let fsElem = false;
      try {
        fsElem = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
      } catch {}

      // 2. Real CSS Fullscreen (:fullscreen pseudo-class pode falhar no querySelector de alguns navegadores)
      let realCSS = false;
      try {
        if (document.fullscreenElement) {
          realCSS = !!(document.querySelector(':fullscreen') || document.querySelector(':-moz-full-screen') || document.querySelector(':-webkit-full-screen'));
        }
      } catch {
        realCSS = false;
      }

      // 3. Hidden & Visibility
      let hidden = false;
      try { hidden = !!document.hidden; } catch {}

      let visState = 'visible';
      try { visState = document.visibilityState || 'visible'; } catch {}

      // 4. Focus
      let focus = true;
      try {
        focus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      } catch {}

      // 5. Escapes
      const escapes = window.__hostileTabEscapes || 0;

      const setBadge = (id, active, activeText, inactiveText) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = active ? activeText : inactiveText;
        el.className = 'status-badge ' + (active ? 'badge-on' : 'badge-off');
      };

      setBadge('stat-fullscreen-elem', fsElem, 'Ativo (Simulado/Real)', 'Nenhum');
      setBadge('stat-fullscreen-real', realCSS, 'Em Tela Cheia Real', 'Janela Normal');
      setBadge('stat-hidden', !hidden, 'Visível (hidden: false)', 'Oculto (hidden: true)');
      setBadge('stat-visibility', visState === 'visible', 'visible', visState);
      setBadge('stat-focus', focus, 'Com Foco', 'Sem Foco');

      const escapeEl = document.getElementById('stat-escapes');
      if (escapeEl) {
        escapeEl.textContent = escapes;
        escapeEl.className = 'status-badge ' + (escapes > 0 ? 'badge-warn' : 'badge-on');
      }
    } catch (err) {
      console.error('Erro em updateStatus:', err);
    }
  }

  // ═══════════════════════════════════════════════════════
  // 5. REGISTRO SEGURO DOS BOTÕES
  // ═══════════════════════════════════════════════════════

  function bindButtons() {
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) {
        el.onclick = fn;
      } else {
        console.warn(`Elemento com id "${id}" não encontrado.`);
      }
    };

    // Fullscreen
    bind('btn-start-fullscreen', async () => {
      try {
        appendLog('FULLSCREEN', 'Chamando document.documentElement.requestFullscreen()…');
        const elem = document.documentElement;
        const requestFn = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen;
        if (!requestFn) {
          appendLog('FULLSCREEN', 'requestFullscreen não suportado neste navegador.', 'error');
          return;
        }
        const promise = requestFn.call(elem);
        if (promise && typeof promise.then === 'function') {
          await promise;
          appendLog('FULLSCREEN', 'Promise de fullscreen resolvida com SUCESSO! (Com Antifullscreen ativo, a janela real NÃO expande)', 'success');
        } else {
          appendLog('FULLSCREEN', 'requestFullscreen executado (modo legado).', 'info');
        }
      } catch (e) {
        appendLog('FULLSCREEN', `Fullscreen rejeitado/falhou: ${e.name} - ${e.message}`, 'error');
      }
      updateStatus();
    });

    bind('btn-exit-fullscreen', async () => {
      try {
        appendLog('FULLSCREEN', 'Chamando document.exitFullscreen()…');
        const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
        if (exitFn) {
          const promise = exitFn.call(document);
          if (promise && typeof promise.then === 'function') await promise;
          appendLog('FULLSCREEN', 'Saída de fullscreen concluída.', 'success');
        }
      } catch (e) {
        appendLog('FULLSCREEN', `Erro ao sair do fullscreen: ${e.name}`, 'error');
      }
      updateStatus();
    });

    // Teste sintético de atalhos
    bind('btn-check-shortcuts', () => {
      appendLog('TESTE', '--- Iniciando teste sintético de atalhos protegidos ---');
      const tests = [
        { key: 'F5', ctrlKey: false },
        { key: 'F11', ctrlKey: false },
        { key: 'F12', ctrlKey: false },
        { key: 'Escape', ctrlKey: false },
        { key: 'c', ctrlKey: true },
        { key: 'v', ctrlKey: true },
        { key: 'r', ctrlKey: true },
        { key: 'u', ctrlKey: true },
      ];

      tests.forEach(({ key, ctrlKey }) => {
        const e = new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true });
        document.dispatchEvent(e);
        const label = (ctrlKey ? 'Ctrl+' : '') + key;
        const status = e.defaultPrevented ? '❌ Bloqueado pelo site' : '✅ Liberado pelo Duck Everything';
        appendLog('ATALHO', `${label}: ${status}`, e.defaultPrevented ? 'error' : 'success');
      });

      const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      document.dispatchEvent(ctx);
      appendLog('ATALHO', `Botão direito (contextmenu): ${ctx.defaultPrevented ? '❌ Bloqueado' : '✅ Liberado'}`, ctx.defaultPrevented ? 'error' : 'success');
    });

    // Foco e Visibilidade sintéticos
    bind('btn-simulate-blur', () => {
      appendLog('TESTE', 'Disparando evento sintético window.blur…');
      window.dispatchEvent(new Event('blur'));
      updateStatus();
    });

    bind('btn-simulate-visibility', () => {
      appendLog('TESTE', 'Disparando evento sintético document.visibilitychange…');
      document.dispatchEvent(new Event('visibilitychange'));
      updateStatus();
    });

    // Clipboard sintético
    bind('btn-test-clipboard', () => {
      appendLog('TESTE', '--- Testando eventos de cópia/colagem ---');
      ['copy', 'cut', 'paste'].forEach(type => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        document.dispatchEvent(e);
        const status = e.defaultPrevented ? '❌ Bloqueado' : '✅ Liberado';
        appendLog('CLIPBOARD', `${type}: ${status}`, e.defaultPrevented ? 'error' : 'success');
      });
    });

    // Alerta
    bind('btn-test-alert', () => {
      appendLog('ALERTA', 'Chamando window.alert("Teste Duck Everything")…');
      const start = performance.now();
      window.alert('Se você está lendo isso, a opção "Silenciar alertas" está desligada ou desativada.');
      const duration = performance.now() - start;
      if (duration < 50) {
        appendLog('ALERTA', `window.alert() executou em ${duration.toFixed(1)}ms sem travar o navegador (SILENCIADO com sucesso pelo Duck Everything)`, 'success');
      } else {
        appendLog('ALERTA', `window.alert() exibiu popup e bloqueou por ${duration.toFixed(0)}ms (Alerta NÃO silenciado)`, 'warn');
      }
    });

    // Locks
    bind('btn-test-locks', async () => {
      appendLog('LOCKS', '--- Testando proteções contra trava de mouse e teclado ---');
      try {
        if (document.documentElement.requestPointerLock) {
          appendLog('LOCKS', 'Chamando document.documentElement.requestPointerLock()…');
          const p = document.documentElement.requestPointerLock();
          if (p && typeof p.then === 'function') {
            await p;
            appendLog('LOCKS', 'Pointer Lock aceito! (Opção "Bloquear captura" desligada)', 'warn');
          } else {
            appendLog('LOCKS', 'Pointer Lock chamado sem Promise.', 'info');
          }
        }
      } catch (e) {
        appendLog('LOCKS', `Pointer Lock NEGADO: ${e.name} (${e.message}) ✅ (Protegido pelo Duck Everything)`, 'success');
      }

      try {
        if (navigator.keyboard?.lock) {
          appendLog('LOCKS', 'Chamando navigator.keyboard.lock()…');
          await navigator.keyboard.lock();
          appendLog('LOCKS', 'Keyboard Lock aceito! (Opção "Bloquear captura" desligada)', 'warn');
        } else {
          appendLog('LOCKS', 'navigator.keyboard.lock não suportado nativamente neste navegador.', 'info');
        }
      } catch (e) {
        appendLog('LOCKS', `Keyboard Lock NEGADO: ${e.name} (${e.message}) ✅ (Protegido pelo Duck Everything)`, 'success');
      }
    });

    // Histórico
    bind('btn-test-history', () => {
      appendLog('HISTÓRICO', 'Testando botão voltar: empurrando estado e disparando popstate…');
      try {
        history.pushState({ page: 'teste' }, '', location.href);
        const e = new PopStateEvent('popstate', { state: { page: 'teste' }, bubbles: true, cancelable: true });
        window.dispatchEvent(e);
        appendLog('HISTÓRICO', 'Evento popstate despachado. Se "Liberar botão Voltar" estiver ativo, handlers hostis foram interceptados.', 'success');
      } catch (err) {
        appendLog('HISTÓRICO', `Erro ao testar histórico: ${err.message}`, 'error');
      }
    });

    // Limpar logs
    bind('btn-clear-log', () => {
      const el = document.getElementById('log');
      if (el) el.textContent = '';
    });
  }

  // ═══════════════════════════════════════════════════════
  // 6. INICIALIZAÇÃO
  // ═══════════════════════════════════════════════════════

  function init() {
    bindButtons();
    updateStatus();
    setInterval(updateStatus, 500);
    appendLog('SISTEMA', 'Laboratório Duck Everything iniciado com sucesso! Pressione qualquer tecla ou use os botões acima para testar.', 'info');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
