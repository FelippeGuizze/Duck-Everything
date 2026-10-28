const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../extension');
const code=f=>fs.readFileSync(path.join(root,f),'utf8');
let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++};
function make(off=[],on=[]){const c=vm.createContext({Promise,queueMicrotask,DOMException,URL});vm.runInContext(`
class Event {constructor(type,o={}){this.type=type;this.isTrusted=true;Object.assign(this,o);this.defaultPrevented=false} preventDefault(){this.defaultPrevented=true} stopImmediatePropagation(){this.stopped=true}}
class EventTarget {constructor(){this.handlers={}}addEventListener(t,f){(this.handlers[t]??=[]).push(f)}dispatchEvent(e){e.target=this;for(const f of this.handlers[e.type]||[]){f(e);if(e.stopped)break}}}
class Element extends EventTarget {constructor(){super();this.isConnected=true}closest(){return this.field?this:null}appendChild(){}requestFullscreen(){return Promise.resolve('native')}requestPointerLock(){return Promise.resolve('native')}}
class Document extends EventTarget {createElement(){return new Element()}hasFocus(){return !!this.focused}get hidden(){return true}get visibilityState(){return 'hidden'}get fullscreenElement(){return null}exitFullscreen(){return Promise.resolve('native')}}
const document=new Document();document.documentElement=new Element();class History{constructor(){this.pushed=0}pushState(){this.pushed++}forward(){this.pushed++}go(){this.pushed++}}
const history=new History();const window=new EventTarget();
Element.prototype.dispatchEvent=function(e){e.target=this;for(const f of window.handlers[e.type]||[]){f(e);if(e.stopped)return}for(const f of this.handlers[e.type]||[]){f(e);if(e.stopped)return}};
document.dispatchEvent=function(e){e.target=this;for(const f of window.handlers[e.type]||[]){f(e);if(e.stopped)return}for(const f of this.handlers[e.type]||[]){f(e);if(e.stopped)return}};window.top=window;window.alert=()=>42;const navigator={keyboard:{lock:()=>Promise.resolve('native')}};`,c);vm.runInContext(code('seed.js'),c);for(const k of off)vm.runInContext(code('off/'+k+'.js'),c);for(const k of on)vm.runInContext('globalThis.__duck_boot_config__.'+k+'=true',c);vm.runInContext(code('core.js'),c);return c;}
const run=(c,s)=>vm.runInContext(s,c);
(async()=>{
let c=make();eq(run(c,'globalThis.__duck_boot_config__'),undefined);
for(const type of ['copy','cut','paste','contextmenu','selectstart','dragstart'])eq(run(c,`(()=>{const e=new Event('${type}');e.preventDefault();return e.defaultPrevented})()`),false);
for(const [feature,type] of [['clipboard','copy'],['clipboard','cut'],['clipboard','paste'],['context','contextmenu'],['selection','selectstart']]){const x=make([feature]);eq(run(x,`(()=>{const e=new Event('${type}');e.preventDefault();return e.defaultPrevented})()`),true)}
const delivered=(x,type,extra='')=>run(x,`(()=>{let n=0;window.addEventListener('${type}',()=>n++);window.dispatchEvent(new Event('${type}',{${extra}}));return n})()`);
// Padrão: Absolute desligado, então o site vê todas as teclas e só perde o poder de cancelar.
eq(delivered(c,'keydown',"key:'a'"),1);eq(delivered(c,'keydown',"key:'F12'"),1);
const cancelled=(x,s)=>run(x,`(()=>{const e=new Event('keydown',{${s}});e.preventDefault();return e.defaultPrevented})()`);
eq(cancelled(c,"key:'F12'"),false);eq(cancelled(make(['shortcuts']),"key:'F12'"),true);
eq(cancelled(c,"key:'c',ctrlKey:true"),false);eq(cancelled(make(['clipboard']),"key:'c',ctrlKey:true"),true);eq(cancelled(make(['clipboard']),"key:'v',ctrlKey:true"),true);
eq(cancelled(make(['clipboard']),"key:'F12'"),false); // copiar/colar não mexem em F12
eq(cancelled(make(['shortcuts']),"key:'c',ctrlKey:true"),false); // atalhos não mexem em Ctrl+C
// Absolute é independente: esconde teclas protegidas e botão direito, nunca teclas comuns nem clique esquerdo.
const abs=make([], ['absolute']);
eq(delivered(abs,'keydown',"key:'a'"),1);eq(delivered(abs,'keydown',"key:'F12'"),0);eq(delivered(abs,'keydown',"key:'Control',ctrlKey:true"),0);eq(delivered(abs,'keyup',"key:'Meta',metaKey:true"),0);eq(delivered(c,'keydown',"key:'Control',ctrlKey:true"),1);eq(delivered(abs,'keydown',"key:'c',ctrlKey:true"),0);
eq(delivered(abs,'mousedown','button:0'),1);eq(delivered(abs,'mousedown','button:2'),0);eq(delivered(abs,'auxclick','button:1'),0);
eq(delivered(make(['selection','shortcuts','clipboard'],['absolute']),'keydown',"key:'F12'"),0); // sem depender de outras opções
eq(delivered(make(['absolute']),'mousedown','button:2'),1);
eq(delivered(make(['shortcuts']),'keydown',"key:'F11'"),1);
// Firefox: blur/focus da janela chegam com alvo `document` (a janela os vê em modo captura).
const deliveredDoc=(x,type)=>run(x,`(()=>{let n=0;window.addEventListener('${type}',()=>n++,true);document.dispatchEvent(new Event('${type}'));return n})()`);
eq(deliveredDoc(c,'blur'),0);eq(deliveredDoc(c,'focus'),0);eq(deliveredDoc(make(['focus']),'blur'),1);eq(deliveredDoc(make(['focus']),'focus'),1);
eq(delivered(c,'blur'),0);eq(delivered(make(['focus']),'blur'),1);eq(delivered(c,'focus'),0);eq(delivered(make(['focus']),'focus'),1);
// Foco de ELEMENTO: some só quando acompanha a troca de janela (document.focused=false = janela já sem foco).
const elEvent=(x,type,focused)=>run(x,`(()=>{document.focused=${focused};let n=0;window.addEventListener('${type}',()=>n++,true);new Element().dispatchEvent(new Event('${type}'));return n})()`);
eq(elEvent(make(),'blur',false),0);eq(elEvent(make(),'focusout',false),0);   // saindo da janela
eq(elEvent(make(),'blur',true),1);eq(elEvent(make(),'focusin',true),1);      // clique normal entre elementos
eq(elEvent(make(['focus']),'blur',false),1);                                  // opção desligada: nada some
eq(run(make(),`(()=>{document.focused=true;document.dispatchEvent(new Event('focus'));let n=0;window.addEventListener('focus',()=>n++,true);new Element().dispatchEvent(new Event('focus'));return n})()`),0); // voltando
// Esconder teclas: some fora de campos de texto, nunca dentro deles.
const k=make([],['keys']);
eq(delivered(k,'keydown',"key:'q'"),0);eq(delivered(k,'keydown',"key:'Alt',altKey:true"),0);eq(delivered(c,'keydown',"key:'q'"),1);
const elKey=(x,field)=>run(x,`(()=>{let n=0;window.addEventListener('keydown',()=>n++,true);const el=new Element();el.field=${field};el.dispatchEvent(new Event('keydown',{key:'q'}));return n})()`);
eq(elKey(k,true),1);eq(elKey(k,false),0);eq(elKey(c,false),1);
// Voltar: popstate sempre chega (roteadores precisam dele); só o re-empurrão do histórico some.
eq(delivered(c,'popstate'),1);eq(delivered(make(['history']),'popstate'),1);eq(delivered(make([],['history']),'popstate'),1);
const trap=(x,call)=>run(x,`(()=>{window.dispatchEvent(new Event('popstate'));history.${call};return history.pushed})()`);
eq(trap(c,'pushState()'),1);eq(trap(make([],['history']),'pushState()'),0);eq(trap(make([],['history']),'go(1)'),0);eq(trap(make([],['history']),'forward()'),0);
eq(run(make([],['history']),'(()=>{history.pushState();return history.pushed})()'),1); // fora de um popstate, pushState normal
eq(run(c,'document.hidden'),false);eq(run(make(['focus']),'document.hidden'),true);
eq(run(c,'window.alert()'),undefined);eq(run(make(['alerts']),'window.alert()'),42);
await run(c,'document.documentElement.requestFullscreen()');eq(run(c,'document.fullscreenElement===document.documentElement'),true);
await run(c,'document.exitFullscreen()');eq(run(c,'document.fullscreenElement'),null);
eq(await run(make(['fullscreen']),'document.documentElement.requestFullscreen()'),'native');
await assert.rejects(run(c,'navigator.keyboard.lock()'),{name:'NotAllowedError'});checks++;
eq(await run(make(['locks']),'navigator.keyboard.lock()'),'native');
// Registry and persistent settings, using a mocked Firefox API.
let registry=[],stored={},listener;
const browser={runtime:{id:'test',onMessage:{addListener:f=>listener=f}},storage:{local:{get:async()=>stored,set:async x=>{stored=x}}},scripting:{getRegisteredContentScripts:async()=>registry,registerContentScripts:async x=>{registry=x},updateContentScripts:async x=>{registry=x},unregisterContentScripts:async()=>{registry=[]}}};
const bg=vm.createContext({browser});vm.runInContext(code('defaults.js'),bg);vm.runInContext(code('background.js'),bg);
let res=await listener({type:'get'},{id:'test'});eq(res.settings.absolute,false);eq(res.settings.history,false);eq(res.settings.clipboard,true);eq(res.settings.keys,false);eq(registry[0].world,'MAIN');eq(registry[0].matches[0],'<all_urls>');
// copy + paste viraram clipboard: quem tinha qualquer uma ligada continua ligada
stored={settings:{copy:false,paste:true}};res=await listener({type:'get'},{id:'test'});eq(res.settings.clipboard,true);
stored={settings:{copy:false,paste:false}};res=await listener({type:'get'},{id:'test'});eq(res.settings.clipboard,false);
stored={settings:{copy:false,paste:false,clipboard:true}};res=await listener({type:'get'},{id:'test'});eq(res.settings.clipboard,true);
stored={};
await listener({type:'save',settings:{absolute:false,fullscreen:false}},{id:'test'});eq(registry[0].js.includes('off/absolute.js'),true);eq(registry[0].js.includes('off/fullscreen.js'),true);eq(stored.settings.absolute,false);
await listener({type:'save',settings:Object.fromEntries(Object.keys(bg.DUCK_DEFAULTS).map(k=>[k,false]))},{id:'test'});eq(registry.length,1);eq(registry[0].js.filter(f=>f.startsWith('off/')).length,Object.keys(bg.DUCK_DEFAULTS).length);
eq(listener({type:'save',settings:{}},{id:'test',tab:{id:1}}),undefined);
console.log(checks+' assertions PASS — Node VM mocks, not browser integration');
})().catch(e=>{console.error(e);process.exitCode=1});
