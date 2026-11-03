// Firefox real, extensão de verdade (sem mocks e sem playwright): instala a pasta extension/ via WebDriver BiDi,
// abre o popup.html numa aba e salva várias combinações de opções — ao vivo, recarregando a aba, com saves
// em sequência e com o background hibernando — conferindo a cada passo o que o lab consegue ver.
// Uso: node tests/firefox-live.cjs [ciclos]   (FIREFOX_PATH se o Firefox não estiver no caminho padrão)
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const FF=process.env.FIREFOX_PATH||({win32:'C:/Program Files/Mozilla Firefox/firefox.exe',darwin:'/Applications/Firefox.app/Contents/MacOS/firefox'})[process.platform]||'firefox';
const ID='duck-everything@local.invalid',UUID='d0c0d0c0-0000-4000-8000-000000000001',PORT=9334;
const N=+process.argv[2]||40;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const prof=fs.mkdtempSync(path.join(os.tmpdir(),'duck-ff-'));
fs.writeFileSync(path.join(prof,'user.js'),[
  `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({[ID]:UUID}))});`, // URL do popup previsível
  'user_pref("remote.allow-system-access", true);',                                              // abrir moz-extension:// numa aba
  'user_pref("extensions.background.idle.timeout", 1500);',                                       // background hiberna rápido
  'user_pref("browser.shell.checkDefaultBrowser", false);','user_pref("datareporting.policy.dataSubmissionEnabled", false);',
].join('\n'));
const server=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const lab='http://127.0.0.1:'+server.address().port+'/lab/';
  const ff=spawn(FF,['--headless','--no-remote','--profile',prof,'--remote-debugging-port='+PORT,'--remote-allow-system-access'],{stdio:'ignore'});
  let ws;for(let i=0;i<60&&!ws;i++){try{const w=new WebSocket(`ws://127.0.0.1:${PORT}/session`);await new Promise((res,rej)=>{w.onopen=res;w.onerror=rej});ws=w}catch{await sleep(500)}}
  if(!ws)throw new Error('Firefox não respondeu ao BiDi (confira FIREFOX_PATH)');
  let id=0;const pend=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);const p=m.id&&pend.get(m.id);if(!p)return;pend.delete(m.id);m.type==='error'?p.rej(new Error(m.error+': '+m.message)):p.res(m.result)};
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async(ctx,expr)=>{const r=await send('script.evaluate',{target:{context:ctx},expression:expr,awaitPromise:true});if(r.type==='exception')throw new Error(r.exceptionDetails.text);return r.result.value};
  let checks=0,fails=0;
  try{
    await send('session.new',{capabilities:{}});
    await send('webExtension.install',{extensionData:{type:'path',path:path.join(root,'extension')}});
    const chrome=(await send('browsingContext.getTree',{'moz:scope':'chrome'})).contexts[0].context;
    await ev(chrome,`gBrowser.selectedTab=gBrowser.addTab('moz-extension://${UUID}/popup.html',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});1`);
    let popup;for(let i=0;i<40&&!popup;i++){await sleep(250);popup=(await send('browsingContext.getTree',{})).contexts.find(c=>c.url.startsWith('moz-extension://'))?.context}
    const {context:page}=await send('browsingContext.create',{type:'tab'});
    const save=s=>ev(popup,`browser.runtime.sendMessage({type:'save',settings:${JSON.stringify(s)}}).then(r=>!!r&&!!r.settings)`);
    // O que um site consegue ver: F12 num campo de texto (Absolute), botão direito por mousedown/pointerdown/movimento (Absolute), tecla comum fora de campo (Esconder teclas).
    const probe=async()=>JSON.parse(await ev(page,`(()=>{const count=(types,fire)=>{let n=0;const h=()=>n++;types.forEach(t=>window.addEventListener(t,h,true));fire();types.forEach(t=>window.removeEventListener(t,h,true));return n};
      let i=document.getElementById('__probe');if(!i){i=document.createElement('input');i.id='__probe';document.body.append(i)}
      return JSON.stringify({active:Event.prototype.preventDefault.name!=='preventDefault',
        f12:count(['keyup'],()=>i.dispatchEvent(new KeyboardEvent('keyup',{key:'F12',bubbles:true})))>0,
        right:count(['mousedown','pointerdown','mousemove'],()=>{document.body.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));document.body.dispatchEvent(new PointerEvent('pointerdown',{button:2,bubbles:true}));document.body.dispatchEvent(new MouseEvent('mousemove',{buttons:2,bubbles:true}))})>0,
        letter:count(['keyup'],()=>document.body.dispatchEvent(new KeyboardEvent('keyup',{key:'q',bubbles:true})))>0})})()`));
    const check=async(s,label)=>{const p=await probe();const ok=p.active&&p.f12===!s.absolute&&p.right===!s.absolute&&p.letter===!s.keys;checks++;
      if(!ok){fails++;console.log('FALHA',label,'esperado',JSON.stringify({absolute:s.absolute,keys:s.keys}),'site viu',JSON.stringify(p))}};
    const base={clipboard:true,context:true,selection:true,absolute:false,shortcuts:true,keys:true,fullscreen:true,focus:true,history:false,locks:true,alerts:true,scribd:true};
    if(!await save(base))throw new Error('o background não respondeu ao save');
    await send('browsingContext.navigate',{context:page,url:lab,wait:'complete'});
    await check(base,'inicial');
    for(let i=0;i<N;i++){
      const s={...base,absolute:i%2===0,keys:i%4<2}; // recargas (i%3===2) passam pelas 4 combinações
      if(i%5===2){save({...s,absolute:!s.absolute});save({...s,keys:!s.keys});} // saves em sequência, sem esperar
      if(i%5===4)await sleep(2500);                                            // deixa o background hibernar
      await save(s);
      const reload=i%3===2;
      if(reload)await send('browsingContext.reload',{context:page,wait:'complete'});
      await check(s,`ciclo ${i} (${reload?'recarregando':'ao vivo'})`);
    }
  }catch(e){fails++;console.error(e)}
  finally{
    try{await send('session.end')}catch{}
    ff.kill();server.close();await sleep(1500);try{fs.rmSync(prof,{recursive:true,force:true})}catch{}
    console.log(fails?`${fails} FALHA(S) em ${checks} verificações`:`${checks} verificações PASS — Firefox real, extensão instalada, ${N} ciclos`);
    process.exit(fails?1:0);
  }
})();
