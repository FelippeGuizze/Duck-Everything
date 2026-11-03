// browser-shim.js — expõe `browser` no Chrome usando `chrome` nativo.
// No Firefox, `browser` já existe com Promises nativas; este arquivo não faz nada lá.
'use strict';
if (typeof browser === 'undefined') {
  const p = (obj, method, ...args) =>
    new Promise((resolve, reject) =>
      obj[method](...args, result =>
        chrome.runtime.lastError
          ? reject(new Error(chrome.runtime.lastError.message))
          : resolve(result)
      )
    );

  // No Chrome, o service worker pode estar suspenso quando o popup abre.
  // chrome.runtime.sendMessage já acorda o SW automaticamente, mas pode
  // levar até ~2 s. Este wrapper tenta até 8 vezes com backoff exponencial.
  const sendMessage = (...args) => new Promise((resolve, reject) => {
    let attempt = 0;
    const MAX = 8;
    const try_ = () => {
      chrome.runtime.sendMessage(...args, result => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          const retriable = /connection|receiving end|establish/i.test(msg);
          if (retriable && attempt < MAX) {
            attempt++;
            setTimeout(try_, 150 * Math.pow(1.5, attempt)); // 150, 225, 337…
          } else {
            reject(new Error(msg));
          }
        } else {
          resolve(result);
        }
      });
    };
    try_();
  });

  globalThis.browser = {
    runtime: {
      get id() { return chrome.runtime.id; },
      getURL: path => chrome.runtime.getURL(path),
      sendMessage,
      // O Chrome ignora Promise retornada pelo listener; responde via sendResponse.
      onMessage: {
        addListener(fn) {
          chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            let out;
            try { out = fn(message, sender); } catch (e) { sendResponse({ error: String(e?.message || e) }); return false; }
            if (out && typeof out.then === 'function') {
              out.then(sendResponse, e => sendResponse({ error: String(e?.message || e) }));
              return true;
            }
            return false;
          });
        },
      },
    },
    storage: {
      local: {
        get:  (...a) => p(chrome.storage.local, 'get',  ...a),
        set:  (...a) => p(chrome.storage.local, 'set',  ...a),
      },
    },
    scripting: {
      getRegisteredContentScripts: (...a) => p(chrome.scripting, 'getRegisteredContentScripts', ...a),
      executeScript:               (...a) => p(chrome.scripting, 'executeScript',               ...a),
      registerContentScripts:      (...a) => p(chrome.scripting, 'registerContentScripts',      ...a),
      updateContentScripts:        (...a) => p(chrome.scripting, 'updateContentScripts',         ...a),
      unregisterContentScripts:    (...a) => p(chrome.scripting, 'unregisterContentScripts',     ...a),
    },
    tabs: {
      get:               (...a) => p(chrome.tabs, 'get',               ...a),
      query:             (...a) => p(chrome.tabs, 'query',             ...a),
      reload:            (...a) => p(chrome.tabs, 'reload',            ...a),
      captureVisibleTab: (...a) => p(chrome.tabs, 'captureVisibleTab', ...a),
    },
    downloads: {
      download:  (...a) => p(chrome.downloads, 'download',  ...a),
      search:    (...a) => p(chrome.downloads, 'search',    ...a),
      onChanged: chrome.downloads.onChanged,
    },
  };
}
