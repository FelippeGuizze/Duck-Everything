'use strict';
const defaults = globalThis.DUCK_DEFAULTS;
const normalize = value => Object.fromEntries(Object.entries(defaults).map(([k,v]) => [k, typeof value?.[k] === 'boolean' ? value[k] : v]));
let queue = Promise.resolve();
function serial(task) { const next = queue.then(task); queue = next.catch(()=>{}); return next; }
async function install(settings) {
  const id = 'duck-main';
  const existing = await browser.scripting.getRegisteredContentScripts({ids:[id]});
  const js = ['seed.js', ...Object.keys(defaults).filter(k=>!settings[k]).map(k=>'off/'+k+'.js'), 'scribd.js', 'core.js'];
  const spec = {id, matches:['<all_urls>'], js, allFrames:true, runAt:'document_start', world:'MAIN', persistAcrossSessions:true};
  if (existing.length) await browser.scripting.updateContentScripts([spec]);
  else await browser.scripting.registerContentScripts([spec]);
}
async function read() { return normalize((await browser.storage.local.get('settings')).settings); }
// Reconcile on background wake; registered scripts persist across sessions.
serial(async()=>install(await read())).catch(()=>{});
browser.runtime.onMessage.addListener((message,sender)=>{
  if(sender.id !== browser.runtime.id || sender.tab) return;
  if(message?.type==='capture') return captureSite(message.tabId, message.saveAs!==false);
  if(message?.type==='get') return serial(async()=>{
    const settings=await read(); await install(settings); return {settings};
  });
  if(message?.type==='save') return serial(async()=>{
    const settings=normalize(message.settings);
    const old=await read();
    await install(settings);
    try { await browser.storage.local.set({settings}); }
    catch(e) { await install(old); throw e; }
    return {settings};
  });
});
