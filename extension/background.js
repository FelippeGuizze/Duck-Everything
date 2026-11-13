'use strict';
const defaults = globalThis.DUCK_DEFAULTS;
const normalize = value => Object.fromEntries(Object.entries(defaults).map(([k,v]) => [k, typeof value?.[k] === 'boolean' ? value[k] : v]));
let queue = Promise.resolve();
function serial(task) { const next = queue.then(task); queue = next.catch(()=>{}); return next; }
// Cada site tem a própria config. Chave = hostname sem "www." (ou "file" para arquivos locais).
function siteKey(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return 'file';
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) ? host : null;
  } catch { return null; }
}
const validKey = k => k === 'file' || (typeof k === 'string' && siteKey('http://' + k + '/') === k);
const patterns = k => k === 'file' ? ['file:///*']
  : ['*://' + k + '/*', ...(k.includes('.') && /[a-z]/.test(k) ? ['*://www.' + k + '/*'] : [])];
const isDefault = s => Object.keys(defaults).every(k => s[k] === defaults[k]);
// seed.js traz os padrões: opção desligada pede off/<k>.js; ligada mas desligada por padrão pede on/<k>.js.
function files(settings) {
  const keys = Object.keys(defaults);
  return ['seed.js', ...keys.filter(k=>!settings[k]).map(k=>'off/'+k+'.js'), ...keys.filter(k=>settings[k]&&!defaults[k]).map(k=>'on/'+k+'.js'), 'scribd.js', 'core.js'];
}
// duck-main cobre os sites sem config própria (padrão); cada site salvo ganha um script só dele.
async function install(sites) {
  const base = {allFrames:true, runAt:'document_start', world:'MAIN', persistAcrossSessions:true};
  const hosts = Object.keys(sites);
  const specs = [
    {...base, id:'duck-main', matches:['<all_urls>'], excludeMatches: hosts.flatMap(patterns), js: files(defaults)},
    ...hosts.map(h => ({...base, id:'duck-site:'+h, matches: patterns(h), js: files(sites[h])}))
  ];
  const existing = new Set((await browser.scripting.getRegisteredContentScripts()).map(s => s.id));
  const wanted = new Set(specs.map(s => s.id));
  const stale = [...existing].filter(id => !wanted.has(id));
  if (stale.length) await browser.scripting.unregisterContentScripts({ids: stale});
  const update = specs.filter(s => existing.has(s.id)), add = specs.filter(s => !existing.has(s.id));
  if (update.length) await browser.scripting.updateContentScripts(update);
  if (add.length) await browser.scripting.registerContentScripts(add);
}
// Empurra as opções "ao vivo" para as abas já abertas DESTE site (as demais só valem após recarregar).
// tabs.query({}) inclui as janelas anônimas (manifest: incognito "spanning").
async function pushLive(host, settings) {
  try {
    const update = Object.fromEntries(globalThis.DUCK_LIVE.map(k => [k, settings[k]]));
    const tabs = (await browser.tabs.query({})).filter(t => Number.isInteger(t.id) && siteKey(t.url || '') === host);
    await Promise.all(tabs.map(t => browser.scripting.executeScript({
      target: { tabId: t.id, allFrames: true }, world: 'MAIN',
      func: (u, h) => {
        const mine = location.protocol === 'file:' ? 'file' : location.hostname.toLowerCase().replace(/^www\./, '');
        if (mine === h) globalThis.__duck_update__ = u;
      }, args: [update, host]
    }).catch(() => {})));
  } catch { /* abas sem acesso: o registro já vale para as próximas páginas */ }
}
// copy + paste viraram uma opção só (clipboard): quem tinha qualquer uma ligada continua ligada.
const migrate = v => (v && typeof v.clipboard !== 'boolean' && (typeof v.copy === 'boolean' || typeof v.paste === 'boolean'))
  ? { ...v, clipboard: (v.copy ?? true) || (v.paste ?? true) } : v;
async function read() {
  const raw = (await browser.storage.local.get('sites')).sites;
  const sites = {};
  for (const [h, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) if (validKey(h)) sites[h] = normalize(migrate(v));
  return sites;
}
// Reconcile on background wake; registered scripts persist across sessions.
serial(async()=>install(await read())).catch(()=>{});
browser.runtime.onMessage.addListener((message,sender)=>{
  // Só páginas da própria extensão (popup; ou popup.html aberto numa aba, como no tests/firefox-live.cjs).
  if(sender.id !== browser.runtime.id || (sender.tab && !(sender.url && sender.url.startsWith(browser.runtime.getURL(''))))) return;
  if(message?.type==='shot') return captureShotReply(message.tabId);
  if(message?.type==='capture') return captureSite(message.tabId, message.saveAs!==false, message.png);
  if(message?.type==='site') return Promise.resolve({host: siteKey(message.url || '')});
  if(message?.type==='get') return serial(async()=>{
    const sites=await read(); await install(sites);
    return {settings: sites[message.host] || normalize()};
  });
  if(message?.type==='save') return serial(async()=>{
    const host=message.host;
    if(!validKey(host)) throw new Error('Esta página não tem um site para salvar a configuração.');
    const settings=normalize(message.settings);
    const old=await read();
    const sites={...old};
    if(isDefault(settings)) delete sites[host]; else sites[host]=settings;
    await install(sites);
    try { await browser.storage.local.set({sites}); }
    catch(e) { await install(old); throw e; }
    await pushLive(host, settings);
    return {settings};
  });
});
