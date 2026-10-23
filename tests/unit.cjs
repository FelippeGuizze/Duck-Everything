const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../extension');
const code=f=>fs.readFileSync(path.join(root,f),'utf8');
let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++};
function make(off=[]){const c=vm.createContext({Promise,queueMicrotask,DOMException,URL});vm.runInContext(`
class Event {constructor(type,o={}){this.type=type;Object.assign(this,o);this.defaultPrevented=false} preventDefault(){this.defaultPrevented=true} stopImmediatePropagation(){this.stopped=true}}
class EventTarget {constructor(){this.handlers={}}addEventListener(t,f){(this.handlers[t]??=[]).push(f)}dispatchEvent(e){e.target=this;for(const f of this.handlers[e.type]||[]){f(e);if(e.stopped)break}}}
class Element extends EventTarget {constructor(){super();this.isConnected=true}appendChild(){}requestFullscreen(){return Promise.resolve('native')}requestPointerLock(){return Promise.resolve('native')}}
class Document extends EventTarget {createElement(){return new Element()}hasFocus(){return false}get hidden(){return true}get visibilityState(){return 'hidden'}get fullscreenElement(){return null}exitFullscreen(){return Promise.resolve('native')}}
const document=new Document();document.documentElement=new Element();const window=new EventTarget();window.alert=()=>42;const navigator={keyboard:{lock:()=>Promise.resolve('native')}};`,c);vm.runInContext(code('seed.js'),c);for(const k of off)vm.runInContext(code('off/'+k+'.js'),c);vm.runInContext(code('core.js'),c);return c;}
const run=(c,s)=>vm.runInContext(s,c);
(async()=>{
let c=make();eq(run(c,'globalThis.__duck_boot_config__'),undefined);
for(const type of ['copy','cut','paste','contextmenu','selectstart','dragstart'])eq(run(c,`(()=>{const e=new Event('${type}');e.preventDefault();return e.defaultPrevented})()`),false);
for(const [feature,type] of [['copy','copy'],['copy','cut'],['paste','paste'],['context','contextmenu'],['selection','selectstart']]){const x=make([feature]);eq(run(x,`(()=>{const e=new Event('${type}');e.preventDefault();return e.defaultPrevented})()`),true)}
const delivered=(x,type,extra='')=>run(x,`(()=>{let n=0;window.addEventListener('${type}',()=>n++);window.dispatchEvent(new Event('${type}',{${extra}}));return n})()`);
eq(delivered(c,'keydown',"key:'a'"),0);eq(delivered(make(['absolute']),'keydown',"key:'a'"),1);
eq(delivered(make(['copy']),'keydown',"key:'c',ctrlKey:true"),1);
eq(delivered(make(['shortcuts']),'keydown',"key:'F11'"),1);
eq(delivered(c,'blur'),0);eq(delivered(make(['focus']),'blur'),1);
eq(delivered(c,'popstate'),0);eq(delivered(make(['history']),'popstate'),1);
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
let res=await listener({type:'get'},{id:'test'});eq(res.settings.absolute,true);eq(registry[0].world,'MAIN');eq(registry[0].matches[0],'<all_urls>');
await listener({type:'save',settings:{absolute:false,fullscreen:false}},{id:'test'});eq(registry[0].js.includes('off/absolute.js'),true);eq(registry[0].js.includes('off/fullscreen.js'),true);eq(stored.settings.absolute,false);
await listener({type:'save',settings:{enabled:false}},{id:'test'});eq(registry.length,0);
eq(listener({type:'save',settings:{}},{id:'test',tab:{id:1}}),undefined);
console.log(checks+' assertions PASS — Node VM mocks, not browser integration');
})().catch(e=>{console.error(e);process.exitCode=1});
