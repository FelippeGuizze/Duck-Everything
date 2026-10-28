const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../extension');
const code=f=>fs.readFileSync(path.join(root,f),'utf8');
let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++};
function make(off=[],on=[]){const c=vm.createContext({Promise,queueMicrotask,DOMException,URL});vm.runInContext(`
class Event {constructor(type,o={}){this.type=type;Object.assign(this,o);this.defaultPrevented=false} preventDefault(){this.defaultPrevented=true} stopImmediatePropagation(){this.stopped=true}}
class EventTarget {constructor(){this.handlers={}}addEventListener(t,f){(this.handlers[t]??=[]).push(f)}dispatchEvent(e){e.target=this;for(const f of this.handlers[e.type]||[]){f(e);if(e.stopped)break}}}
class Element extends EventTarget {constructor(){super();this.isConnected=true}appendChild(){}requestFullscreen(){return Promise.resolve('native')}requestPointerLock(){return Promise.resolve('native')}}
class Document extends EventTarget {createElement(){return new Element()}hasFocus(){return false}get hidden(){return true}get visibilityState(){return 'hidden'}get fullscreenElement(){return null}exitFullscreen(){return Promise.resolve('native')}}
const document=new Document();document.documentElement=new Element();class History{constructor(){this.pushed=0}pushState(){this.pushed++}forward(){this.pushed++}go(){this.pushed++}}
const history=new History();const window=new EventTarget();window.alert=()=>42;const navigator={keyboard:{lock:()=>Promise.resolve('native')}};`,c);vm.runInContext(code('seed.js'),c);for(const k of off)vm.runInContext(code('off/'+k+'.js'),c);for(const k of on)vm.runInContext('globalThis.__duck_boot_config__.'+k+'=true',c);vm.runInContext(code('core.js'),c);return c;}
const run=(c,s)=>vm.runInContext(s,c);
(async()=>{
let c=make();eq(run(c,'globalThis.__duck_boot_config__'),undefined);
for(const type of ['copy','cut','paste','contextmenu','selectstart','dragstart'])eq(run(c,`(()=>{const e=new Event('${type}');e.preventDefault();return e.defaultPrevented})()`),false);
for(const [feature,type] of [['copy','copy'],['copy','cut'],['paste','paste'],['context','contextmenu'],['selection','selectstart']]){const x=make([feature]);eq(run(x,`(()=>{const e=new Event('${type}');e.preventDefault();return e.defaultPrevented})()`),true)}
const delivered=(x,type,extra='')=>run(x,`(()=>{let n=0;window.addEventListener('${type}',()=>n++);window.dispatchEvent(new Event('${type}',{${extra}}));return n})()`);
// Padrão: Absolute desligado, então o site vê todas as teclas e só perde o poder de cancelar.
eq(delivered(c,'keydown',"key:'a'"),1);eq(delivered(c,'keydown',"key:'F12'"),1);
const cancelled=(x,s)=>run(x,`(()=>{const e=new Event('keydown',{${s}});e.preventDefault();return e.defaultPrevented})()`);
eq(cancelled(c,"key:'F12'"),false);eq(cancelled(make(['shortcuts']),"key:'F12'"),true);
eq(cancelled(c,"key:'c',ctrlKey:true"),false);eq(cancelled(make(['copy']),"key:'c',ctrlKey:true"),true);
eq(cancelled(make(['copy','paste']),"key:'F12'"),false); // copiar/colar não mexem em F12
eq(cancelled(make(['shortcuts']),"key:'c',ctrlKey:true"),false); // atalhos não mexem em Ctrl+C
// Absolute é independente: esconde teclas protegidas e botão direito, nunca teclas comuns nem clique esquerdo.
const abs=make([], ['absolute']);
eq(delivered(abs,'keydown',"key:'a'"),1);eq(delivered(abs,'keydown',"key:'F12'"),0);eq(delivered(abs,'keydown',"key:'c',ctrlKey:true"),0);
eq(delivered(abs,'mousedown','button:0'),1);eq(delivered(abs,'mousedown','button:2'),0);eq(delivered(abs,'auxclick','button:1'),0);
eq(delivered(make(['selection','shortcuts','copy','paste'],['absolute']),'keydown',"key:'F12'"),0); // sem depender de outras opções
eq(delivered(make(['absolute']),'mousedown','button:2'),1);
eq(delivered(make(['shortcuts']),'keydown',"key:'F11'"),1);
eq(delivered(c,'blur'),0);eq(delivered(make(['focus']),'blur'),1);
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
let res=await listener({type:'get'},{id:'test'});eq(res.settings.absolute,false);eq(res.settings.history,false);eq(res.settings.copy,true);eq(registry[0].world,'MAIN');eq(registry[0].matches[0],'<all_urls>');
await listener({type:'save',settings:{absolute:false,fullscreen:false}},{id:'test'});eq(registry[0].js.includes('off/absolute.js'),true);eq(registry[0].js.includes('off/fullscreen.js'),true);eq(stored.settings.absolute,false);
await listener({type:'save',settings:Object.fromEntries(Object.keys(bg.DUCK_DEFAULTS).map(k=>[k,false]))},{id:'test'});eq(registry.length,1);eq(registry[0].js.filter(f=>f.startsWith('off/')).length,Object.keys(bg.DUCK_DEFAULTS).length);
eq(listener({type:'save',settings:{}},{id:'test',tab:{id:1}}),undefined);
console.log(checks+' assertions PASS — Node VM mocks, not browser integration');
})().catch(e=>{console.error(e);process.exitCode=1});
