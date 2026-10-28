(() => {
  'use strict';
  const cfg = globalThis.__duck_boot_config__;
  delete globalThis.__duck_boot_config__;
  if (!cfg) return;
  /*
    Regra geral: cada opção só mexe no próprio assunto.
      - "Liberar" (copy, paste, context, selection, shortcuts): o site continua
        recebendo os eventos, mas preventDefault() deixa de funcionar neles.
        Handlers inline (`onpaste="return false"`) não passam por preventDefault,
        então nesses casos o evento é escondido do site.
      - "Esconder" (absolute): o site deixa de ver botão direito/meio e as teclas
        protegidas. Não libera nada sozinho.
      - "Simular" (fullscreen, focus) e "Negar" (history, locks, alerts) não
        dependem de nenhuma outra opção.
  */
  const define=(obj,key,desc)=>{try{Object.defineProperty(obj,key,{configurable:true,...desc});}catch{}};
  const method=(obj,key,value)=>define(obj,key,{writable:true,value});
  const add=EventTarget.prototype.addEventListener;
  const on=(obj,type,fn)=>add.call(obj,type,fn,true);
  const stop=Event.prototype.stopImmediatePropagation;
  const prevent=Event.prototype.preventDefault;

  const asElement=t=>(typeof Element!=='undefined' && t instanceof Element)?t:(t&&t.parentElement)||null;
  // Elementos em que um clique faz algo. Nunca mexemos em mousedown neles.
  const INTERACTIVE='a[href],button,input,select,textarea,summary,label,video,audio,[onclick],[contenteditable],[draggable="true"],[tabindex]:not([tabindex="-1"]),[role=button],[role=link],[role=menuitem],[role=option],[role=tab],[role=switch],[role=checkbox],[role=slider]';
  const interactive=t=>{
    const el=asElement(t);
    if(!el||!el.closest)return false;
    try{
      if(el.closest(INTERACTIVE))return true;
      return !['auto','text','default'].includes(getComputedStyle(el).cursor);
    }catch{return false;}
  };
  const draggable=t=>{const el=asElement(t);return !!(el&&el.closest&&el.closest('[draggable="true"]'));};
  // `onX = fn` / atributo onX="..." podem cancelar com `return false`, sem chamar preventDefault().
  const inlineHandler=e=>{
    const prop='on'+e.type;
    for(let n=e.target;n;n=n.parentNode||n.host)if(n[prop])return true;
    return !!window[prop];
  };

  const isKey=t=>t==='keydown'||t==='keyup'||t==='keypress';
  const keyOf=e=>(e.key||'').toLowerCase();
  const mod=e=>e.ctrlKey||e.metaKey;
  // Ctrl+C/X pertencem a "copy", Ctrl+V a "paste"; o resto à "shortcuts".
  const clipboardOwner=e=>!mod(e)?null:(['c','x'].includes(keyOf(e))?'copy':keyOf(e)==='v'?'paste':null);
  const shortcut=e=>['f5','f11','f12','escape'].includes(keyOf(e))||(mod(e)&&['r','u','i'].includes(keyOf(e)));
  const keyUnlocked=e=>{const o=clipboardOwner(e);return o?cfg[o]:cfg.shortcuts&&shortcut(e);};
  const keyProtected=e=>!!clipboardOwner(e)||shortcut(e);

  // O site não consegue mais cancelar a ação.
  const uncancelable=e=>{
    const t=e.type;
    if(t==='copy'||t==='cut')return cfg.copy;
    if(t==='paste')return cfg.paste;
    if(t==='contextmenu')return cfg.context;
    if(t==='select'||t==='selectstart')return cfg.selection;
    if(t==='dragstart'||t==='drag')return cfg.selection&&!draggable(e.target);
    if(isKey(t))return keyUnlocked(e);
    // Clique esquerdo em texto comum: sites usam mousedown+preventDefault para impedir a seleção.
    if(t==='mousedown')return cfg.selection&&e.button===0&&!interactive(e.target);
    return false;
  };
  // O site nem fica sabendo que o evento aconteceu.
  const hidden=e=>{
    const t=e.type;
    if(t==='copy'||t==='cut')return cfg.copy;
    if(t==='paste')return cfg.paste;
    if(t==='contextmenu')return cfg.context;
    if(t==='select'||t==='selectstart')return cfg.selection;
    if(t==='dragstart'||t==='drag')return cfg.selection&&!draggable(e.target);
    if(isKey(t))return (cfg.absolute&&keyProtected(e))||(keyUnlocked(e)&&inlineHandler(e));
    if(t==='mousedown'||t==='mouseup'||t==='auxclick'){
      if(cfg.absolute&&e.button!==0)return true;
      return t==='mousedown'&&uncancelable(e)&&inlineHandler(e);
    }
    return false;
  };

  method(Event.prototype,'preventDefault',function(){
    if(uncancelable(this))return;
    return prevent.call(this);
  });
  const types=['copy','cut','paste','contextmenu','select','selectstart','drag','dragstart','mousedown','mouseup','auxclick','keydown','keyup','keypress'];
  for(const type of types)on(window,type,e=>{if(hidden(e))stop.call(e);});

  if(cfg.selection){
    const style=document.createElement('style');
    style.textContent='* { user-select: text !important; -moz-user-select: text !important; -webkit-user-select: text !important; }';
    const attach=()=>{if(document.documentElement){document.documentElement.appendChild(style);return true;}return false;};
    if(!attach()) {const observer=new MutationObserver(()=>{if(attach())observer.disconnect();});observer.observe(document,{childList:true,subtree:true});}
  }
  if(cfg.fullscreen){
    let active=null;
    const notify=target=>queueMicrotask(()=>{
      const event=new Event('fullscreenchange',{bubbles:true});
      (target?.isConnected?target:document).dispatchEvent(event);
    });
    const request=function(){
      if(!(this instanceof Element) || !this.isConnected)return Promise.reject(new TypeError('Element is not connected'));
      active=this;notify(this);return Promise.resolve();
    };
    const exit=function(){const old=active;active=null;notify(old);return Promise.resolve();};
    method(Element.prototype,'requestFullscreen',request);
    method(Document.prototype,'exitFullscreen',exit);
    define(Document.prototype,'fullscreenElement',{get:()=>active?.isConnected?active:null});
    define(Document.prototype,'fullscreenEnabled',{get:()=>true});
    for(const k of ['webkitRequestFullscreen','mozRequestFullScreen'])if(k in Element.prototype)method(Element.prototype,k,request);
    for(const k of ['webkitExitFullscreen','mozCancelFullScreen'])if(k in Document.prototype)method(Document.prototype,k,exit);
    for(const k of ['webkitFullscreenElement','mozFullScreenElement'])if(k in Document.prototype)define(Document.prototype,k,{get:()=>active?.isConnected?active:null});
  }
  if(cfg.focus){
    define(Document.prototype,'hidden',{get:()=>false});
    define(Document.prototype,'visibilityState',{get:()=>'visible'});
    define(Document.prototype,'hasFocus',{get:()=>()=>true});
    // Só o blur da própria janela e o visibilitychange somem. focus/focusin/focusout
    // dos elementos seguem normais (menus, modais e foco de teclado dependem deles).
    on(window,'blur',e=>{if(e.target===window)stop.call(e);});
    on(window,'visibilitychange',e=>stop.call(e));
  }
  if(cfg.history&&typeof History!=='undefined'){
    // Armadilha de "Voltar": o site reage ao popstate empurrando outra entrada no
    // histórico. Os popstate continuam chegando (roteadores de SPA precisam deles);
    // só pushState/forward/go(+n) logo depois de um popstate são ignorados.
    let guardUntil=0;
    on(window,'popstate',()=>{guardUntil=Date.now()+400;});
    const guarded=()=>Date.now()<guardUntil;
    const {pushState,forward,go}=History.prototype;
    method(History.prototype,'pushState',function(...a){return guarded()?undefined:pushState.apply(this,a);});
    method(History.prototype,'forward',function(){return guarded()?undefined:forward.call(this);});
    method(History.prototype,'go',function(delta,...a){return guarded()&&Number(delta)>0?undefined:go.call(this,delta,...a);});
  }
  if(cfg.locks){
    const denied=()=>Promise.reject(new DOMException('Permission denied','NotAllowedError'));
    if(navigator.keyboard?.lock)method(navigator.keyboard,'lock',denied);
    if(Element.prototype.requestPointerLock)method(Element.prototype,'requestPointerLock',denied);
  }
  if(cfg.alerts)method(window,'alert',()=>undefined);
})();
