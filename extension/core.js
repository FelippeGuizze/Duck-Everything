(() => {
  'use strict';
  const cfg = globalThis.__graphite_boot_config__;
  delete globalThis.__graphite_boot_config__;
  if (!cfg) return;
  const define=(obj,key,desc)=>{try{Object.defineProperty(obj,key,{configurable:true,...desc});}catch{}};
  const method=(obj,key,value)=>define(obj,key,{writable:true,value});
  const add=EventTarget.prototype.addEventListener;
  const on=(obj,type,fn)=>add.call(obj,type,fn,true);
  const stop=Event.prototype.stopImmediatePropagation;
  const keyAllowed=e=>{
    const k=(e.key||'').toLowerCase();
    if((e.ctrlKey||e.metaKey) && ((cfg.copy && ['c','x'].includes(k)) || (cfg.paste && k==='v'))) return true;
    return cfg.shortcuts && (['f5','f11','f12','escape'].includes(k) || ((e.ctrlKey||e.metaKey)&&['r','u','i'].includes(k)));
  };
  const protectedEvent=e=>{
    if(['copy','cut'].includes(e.type))return cfg.copy;
    if(e.type==='paste')return cfg.paste;
    if(e.type==='contextmenu')return cfg.context;
    if(['select','selectstart','dragstart','drag'].includes(e.type))return cfg.selection;
    if(['keydown','keyup','keypress'].includes(e.type))return keyAllowed(e);
    return false;
  };
  const prevent=Event.prototype.preventDefault;
  method(Event.prototype,'preventDefault',function(){
    if(protectedEvent(this))return;
    return prevent.call(this);
  });
  const types=['copy','cut','paste','contextmenu','select','selectstart','drag','dragstart','mousedown','mouseup','keydown','keyup','keypress'];
  for(const type of types) on(window,type,e=>{
    // Basic mode prevents event handlers from cancelling native copy/paste/menu.
    // Absolute additionally prevents mouse/keyboard handlers from running.
    const ordinary = protectedEvent(e);
    const absolute = cfg.absolute && ((cfg.selection && ['mousedown','mouseup'].includes(type)) ||
      (cfg.shortcuts && ['keydown','keyup','keypress'].includes(type) &&
        !((e.ctrlKey||e.metaKey) && ((!cfg.copy && ['c','x'].includes((e.key||'').toLowerCase())) || (!cfg.paste && (e.key||'').toLowerCase()==='v')))));
    if(ordinary || absolute)stop.call(e);
  });
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
    method(Document.prototype,'hasFocus',()=>true);
    on(window,'blur',e=>{if(e.target===window)stop.call(e);});
    on(window,'visibilitychange',e=>stop.call(e));
  }
  if(cfg.history)on(window,'popstate',e=>stop.call(e));
  if(cfg.locks){
    const denied=()=>Promise.reject(new DOMException('Permission denied','NotAllowedError'));
    if(navigator.keyboard?.lock)method(navigator.keyboard,'lock',denied);
    if(Element.prototype.requestPointerLock)method(Element.prototype,'requestPointerLock',denied);
  }
  if(cfg.alerts)method(window,'alert',()=>undefined);
})();
