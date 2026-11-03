(() => {
  'use strict';
  const cfg = globalThis.__duck_boot_config__;
  delete globalThis.__duck_boot_config__;
  if (!cfg) return;
  /*
    Regra geral: cada opção só mexe no próprio assunto.
      - "Liberar" (clipboard, context, selection, shortcuts): o site continua
        recebendo os eventos, mas preventDefault() deixa de funcionar neles.
        Handlers inline (`onpaste="return false"`) não passam por preventDefault,
        então nesses casos o evento é escondido do site.
      - "Esconder" (absolute, keys): absolute faz o site deixar de ver botão direito/meio
        e as teclas protegidas; keys faz o site deixar de ver as teclas fora de campos
        de texto. Não liberam nada sozinhas.
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
  // Ctrl+C/X/V pertencem a "clipboard"; o resto à "shortcuts".
  const clipboardKey=e=>mod(e)&&['c','x','v'].includes(keyOf(e));
  // Campo onde se digita: aqui "keys" não esconde nada, senão ninguém conseguiria escrever.
  const TEXT_FIELD='textarea,[contenteditable]:not([contenteditable="false"]),[role=textbox],input:not([type]),input[type=text],input[type=search],input[type=email],input[type=url],input[type=tel],input[type=password],input[type=number]';
  const typing=t=>{const el=asElement(t);try{return !!(el&&el.closest&&el.closest(TEXT_FIELD));}catch{return false;}};
  const shortcut=e=>['f5','f11','f12','escape'].includes(keyOf(e))||(mod(e)&&['r','u','i'].includes(keyOf(e)));
  const keyUnlocked=e=>clipboardKey(e)?cfg.clipboard:cfg.shortcuts&&shortcut(e);
  const keyProtected=e=>clipboardKey(e)||shortcut(e)||['control','meta'].includes(keyOf(e));

  // O site não consegue mais cancelar a ação.
  const uncancelable=e=>{
    const t=e.type;
    if(t==='copy'||t==='cut'||t==='paste')return cfg.clipboard;
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
    if(t==='copy'||t==='cut'||t==='paste')return cfg.clipboard;
    if(t==='contextmenu')return cfg.context;
    if(t==='select'||t==='selectstart')return cfg.selection;
    if(t==='dragstart'||t==='drag')return cfg.selection&&!draggable(e.target);
    if(isKey(t))return (cfg.absolute&&keyProtected(e))||(cfg.keys&&!typing(e.target))||(keyUnlocked(e)&&inlineHandler(e));
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

  // user-select liberado: o <style> entra e sai conforme cfg.selection (pode mudar ao vivo).
  const selectStyle=document.createElement('style');
  selectStyle.textContent='* { user-select: text !important; -moz-user-select: text !important; -webkit-user-select: text !important; }';
  let selectWatch=null;
  const syncSelectStyle=()=>{
    if(!cfg.selection){if(selectStyle.parentNode)selectStyle.remove();return;}
    if(document.documentElement){document.documentElement.appendChild(selectStyle);return;}
    if(selectWatch)return;
    selectWatch=new MutationObserver(()=>{if(document.documentElement){selectWatch.disconnect();selectWatch=null;syncSelectStyle();}});
    selectWatch.observe(document,{childList:true,subtree:true});
  };
  syncSelectStyle();
  // "Salvar" no popup empurra as opções que funcionam ao vivo (clipboard, context, selection,
  // shortcuts, absolute, keys, locks, alerts). As demais (fullscreen, focus, history, scribd)
  // instalam seus ganchos no carregamento e só mudam depois de recarregar a aba.
  define(globalThis,'__duck_update__',{get:()=>undefined,set:update=>{
    if(!update||typeof update!=='object')return;
    for(const k of Object.keys(cfg))if(typeof update[k]==='boolean')cfg[k]=update[k];
    syncSelectStyle();
  }});
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
    const nativeHasFocus=Document.prototype.hasFocus;
    define(Document.prototype,'hidden',{get:()=>false});
    define(Document.prototype,'visibilityState',{get:()=>'visible'});
    define(Document.prototype,'hasFocus',{get:()=>()=>true});
    // Some o que entrega a troca de janela/aba: blur/focus da janela, visibilitychange e o
    // foco dos ELEMENTOS que acompanha essa troca. O foco normal entre elementos (menus,
    // modais, campos) continua intacto.
    //  - O Firefox entrega o blur/focus da janela com alvo `document`; o Chrome usa `window`.
    //  - Ao SAIR, o blur/focusout do elemento ativo chega antes do da janela, mas com
    //    hasFocus() já falso (clique entre botões nunca tem isso).
    //  - Ao VOLTAR, o focus da janela chega primeiro e o do elemento logo depois.
    const windowLevel=e=>e.target===window||e.target===document;
    let quietUntil=0;
    for(const type of ['blur','focus','focusin','focusout'])on(window,type,e=>{
      if((type==='blur'||type==='focus')&&windowLevel(e)){
        if(type==='focus'&&e.isTrusted)quietUntil=Date.now()+200; // só a troca real de janela, não focus sintético
        stop.call(e);return;
      }
      // Só no frame principal: dentro de iframes o foco sai de forma normal sem trocar de janela.
      if(window===window.top&&(Date.now()<quietUntil||!nativeHasFocus.call(document)))stop.call(e);
    });
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
  {
    const denied=()=>Promise.reject(new DOMException('Permission denied','NotAllowedError'));
    const guard=(obj,key)=>{
      const native=obj?.[key];
      if(typeof native==='function')method(obj,key,function(...a){return cfg.locks?denied():native.apply(this,a);});
    };
    guard(navigator.keyboard,'lock');
    guard(Element.prototype,'requestPointerLock');
    const nativeAlert=window.alert;
    if(typeof nativeAlert==='function')method(window,'alert',function(...a){return cfg.alerts?undefined:nativeAlert.apply(this,a);});
  }
})();
