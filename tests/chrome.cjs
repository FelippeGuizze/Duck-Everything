// Teste de integração com Chrome real (DevTools Protocol, sem dependências).
// Injeta seed.js + core.js no MAIN world como o background faz e usa entrada
// confiável (cliques, teclas, arraste) contra o laboratório.
// Uso: node tests/chrome.cjs   (CHROME_PATH opcional)
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const chromePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
if(!chromePath){console.error('Chrome não encontrado; defina CHROME_PATH.');process.exit(1);}
const code=f=>fs.readFileSync(path.join(process.env.DUCK_EXT_DIR||path.join(root,'extension'),f),'utf8');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript'};
const server=http.createServer((req,res)=>{
  const f=path.join(root,decodeURIComponent(req.url.split('?')[0]).replace(/\/$/,'/index.html'));
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'}).end(fs.readFileSync(f));
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(url){
  const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const pend=new Map();
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);const p=pend.get(m.id);if(!p)return;pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);};
  return {send:(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method,params}));}),close:()=>ws.close()};
}
const MODES={
  off:'',
  padrao:code('seed.js')+';globalThis.__duck_boot_config__.keys=false;'+code('core.js'),
  absolute:code('seed.js')+';Object.assign(globalThis.__duck_boot_config__,{absolute:true,keys:false});'+code('core.js'),
  voltar:code('seed.js')+';Object.assign(globalThis.__duck_boot_config__,{absolute:false,history:true,keys:false});'+code('core.js'),
  teclas:code('seed.js')+';globalThis.__duck_boot_config__.keys=true;'+code('core.js'),
  tudo:code('seed.js')+';Object.assign(globalThis.__duck_boot_config__,{absolute:true,history:true,keys:true});'+code('core.js'),
};
let checks=0;const eq=(a,b,msg)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(msg+': obtido '+JSON.stringify(a)+', esperado '+JSON.stringify(b));checks++;};

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'duck-chrome-'));
  const chrome=spawn(chromePath,['--headless=new','--remote-debugging-port=9333','--user-data-dir='+profile,'--window-size=1300,3200','--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore'});
  try{
    for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:9333/json/version');break;}catch{await sleep(200);}}
    for(const [mode,inject] of Object.entries(MODES)){
      if(process.env.DUCK_ONLY&&process.env.DUCK_ONLY!==mode)continue;
      const t=await (await fetch('http://127.0.0.1:9333/json/new?about:blank',{method:'PUT'})).json();
      const cdp=await connect(t.webSocketDebuggerUrl);
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true}); // janela "com foco", como no uso real
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:1300,height:3200,deviceScaleFactor:1,mobile:false});
      if(inject)await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:inject});
      await cdp.send('Page.navigate',{url:base+'/lab/'});
      const ev=async expr=>{const r=await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+(r.exceptionDetails.exception?.description||''));return r.result.value;};
      for(let i=0;i<50&&!(await ev("document.readyState==='complete'&&!!document.getElementById('abs-button')"));i++)await sleep(100);
      await sleep(300);
      const text=sel=>ev(`document.querySelector(${JSON.stringify(sel)}).textContent`);
      const center=async sel=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      const mouse=(type,x,y,button='left',extra={})=>cdp.send('Input.dispatchMouseEvent',{type,x,y,button,buttons:button==='left'?1:button==='right'?2:4,clickCount:1,...extra});
      const click=async(sel,button='left')=>{const [x,y]=await center(sel);await mouse('mouseMoved',x,y,'none');await mouse('mousePressed',x,y,button);await mouse('mouseReleased',x,y,button);await sleep(60);};
      const key=async(k,o={})=>{await cdp.send('Input.dispatchKeyEvent',{type:o.text?'keyDown':'rawKeyDown',key:k,code:o.code||k,windowsVirtualKeyCode:o.vk,modifiers:o.mod||0,text:o.text});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:o.code||k,windowsVirtualKeyCode:o.vk,modifiers:o.mod||0});await sleep(40);};
      const active=mode!=='off',abs=mode==='absolute'||mode==='tudo',hist=mode==='voltar'||mode==='tudo',keysOn=mode==='teclas'||mode==='tudo';

      // ── 1. Uso normal precisa continuar funcionando em TODOS os modos (bug do "botão não clica") ──
      await click('#abs-button');await click('#abs-button');
      eq(await text('#abs-button-count'),'2 cliques (tem que subir sempre)',`[${mode}] botão comum clicável`);
      await click('#abs-input');
      await key('a',{text:'a',code:'KeyA',vk:65});await key('b',{text:'b',code:'KeyB',vk:66});
      await key('Enter',{text:'\r',code:'Enter',vk:13});
      eq(await text('#abs-input-count'),'Enter registrado: 1 vezes',`[${mode}] Enter em campo do site`);
      eq(await text('#spy-keys'),'3',`[${mode}] teclas comuns visíveis ao site`);
      eq(await text('#spy-left'),'3',`[${mode}] clique esquerdo visível ao site`);

      // ── 2. Absolute esconde só botão direito/meio e teclas protegidas ──
      await click('#abs-pad','right');await click('#abs-pad','middle');
      eq(await text('#spy-other'),abs?'0':'2',`[${mode}] direito/meio vistos pelo site`);
      eq(abs?await text('#spy-chan')==='0':Number(await text('#spy-chan'))>0,true,`[${mode}] direito/meio por pointer/contextmenu/movimento`);
      {const [x,y]=await center('#abs-pad');await mouse('mousePressed',x,y,'right');await mouse('mouseMoved',x+5,y+5,'right');await mouse('mouseReleased',x+5,y+5,'right');await sleep(60);}
      eq(abs?await text('#spy-chan')==='0':true,true,`[${mode}] arrastar com botão direito escondido`);
      await key('F12',{code:'F12',vk:123});await key('c',{code:'KeyC',vk:67,mod:2});
      eq(await text('#spy-prot'),(abs||keysOn)?'0':'2',`[${mode}] teclas protegidas vistas pelo site`);
      // Esconder teclas: tecla comum fora de campo de texto some; dentro do campo (já testado acima) continua
      await ev("document.activeElement&&document.activeElement.blur()");
      await key('q',{text:'q',code:'KeyQ',vk:81});await key('Alt',{code:'AltLeft',vk:18,mod:1});
      eq(await text('#spy-keys'),keysOn?'3':'5',`[${mode}] teclas fora de campo de texto`);
      await click('#abs-input');await key('z',{text:'z',code:'KeyZ',vk:90});
      eq(await text('#spy-keys'),keysOn?'4':'6',`[${mode}] teclas dentro de campo de texto continuam`);
      eq((await text('#abs-verdict')).startsWith(abs?'✅':'👀'),true,`[${mode}] veredito do lab`);

      // ── 3. Voltar: roteador de SPA nunca pode quebrar (bug do GitHub); armadilha só falha com a opção ──
      await click('#btn-test-router');await sleep(350);
      eq((await text('#history-result')).startsWith('✅'),true,`[${mode}] roteador recebe o Voltar`);
      await click('#btn-test-trap');await sleep(250);
      eq((await text('#history-result')).startsWith(hist?'✅':'❌'),true,`[${mode}] armadilha ${hist?'bloqueada':'funciona'}`);
      // Voltar real, com armadilha armada
      await click('#trap-arm');
      await cdp.send('Runtime.evaluate',{expression:'history.back()'});await sleep(400);
      // Sem a opção, a armadilha re-empurra {trap:true} depois do Voltar; com ela, o estado é o da entrada anterior.
      eq(await ev('history.state?.trap===true'),!hist,`[${mode}] Voltar real ${hist?'sai da armadilha':'é preso pela armadilha'}`);
      await click('#trap-disarm');

      // ── 4. Selecionar e arrastar ──
      const [sx,sy]=await center('#sel-protected');
      await mouse('mouseMoved',sx-150,sy,'none');await mouse('mousePressed',sx-150,sy);await mouse('mouseMoved',sx+150,sy,'left',{buttons:1});await mouse('mouseReleased',sx+150,sy);await sleep(100);
      const selected=await ev('String(getSelection()).length');
      eq(selected>0,active,`[${mode}] selecionar texto protegido (${selected} caracteres)`);
      eq(await ev(`(()=>{const e=new DragEvent('dragstart',{bubbles:true,cancelable:true});document.getElementById('drag-img').dispatchEvent(e);return e.defaultPrevented})()`),!active,`[${mode}] dragstart da imagem`);
      await ev(`document.getElementById('dnd-item').dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}))`);
      eq((await text('#dnd-result')).includes('dragstart visto 1x'),true,`[${mode}] arrastar-e-soltar do próprio site continua`);
      // ── 5. Foco: a janela não pode ser detectada, o foco entre elementos continua normal ──
      await ev(`window.__w=0;window.__el=0;window.addEventListener('blur',e=>{e.target===window?window.__w++:window.__el++},true);window.addEventListener('focus',e=>{e.target===window?window.__w++:window.__el++},true)`);
      await ev(`window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))`);
      eq(await ev('window.__w'),active?0:2,`[${mode}] blur/focus da janela vistos pelo site`);
      await ev(`document.getElementById('abs-input').focus();document.getElementById('abs-button').focus()`);
      eq(await ev('window.__el>0'),true,`[${mode}] foco entre elementos continua`);
      // ── 6. Botões de copiar do lab ──
      await ev(`window.__labText='';navigator.clipboard.writeText=t=>{window.__labText=t;return Promise.resolve()}`);
      await click('#btn-copy-log');await sleep(150);
      eq((await ev('window.__labText')).includes('# Extensão ativa nesta página: '+(active?'sim':'NÃO')),true,`[${mode}] cabeçalho do log copiado`);
      const opts=await ev('window.__labText');
      for(const [k,v] of Object.entries({clipboard:active,keys:keysOn,context:active,selection:active,shortcuts:active,absolute:abs,fullscreen:active,focus:active,history:hist,locks:active,alerts:active}))
        eq(opts.includes(k+'='+(v?'on':'off')),true,`[${mode}] diagnóstico do lab: ${k} deveria estar ${v?'on':'off'}`);
      await click('#btn-copy-summary');await sleep(150);
      eq(/# Resumo: \d+ linhas, \d+ diferentes/.test(await ev('window.__labText')),true,`[${mode}] resumo copiado`);
      console.log('  ok  '+mode);
      cdp.close();await fetch('http://127.0.0.1:9333/json/close/'+t.id);
    }
    console.log(checks+' assertions PASS — Chrome real (CDP), entrada confiável, 5 configurações');
  }finally{chrome.kill();server.close();try{fs.rmSync(profile,{recursive:true,force:true});}catch{}}
})().catch(e=>{console.error(e);process.exitCode=1;});
