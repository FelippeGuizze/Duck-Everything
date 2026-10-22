'use strict';
const keys=Object.keys(globalThis.GRAPHITE_DEFAULTS);
const status=document.getElementById('status');
const errorText=e=>String(e?.message||e||'Erro desconhecido').replace(/data:[^\s]+/gi,'[imagem omitida]').replace(/blob:[^\s]+/gi,'[arquivo temporário]').slice(0,240);
const buttons=[...document.querySelectorAll('button')];
const busy=value=>buttons.forEach(b=>b.disabled=value);
const show=s=>keys.forEach(k=>document.getElementById(k).checked=s[k]);
async function save(reload) {
  busy(true);
  try {
    const settings=Object.fromEntries(keys.map(k=>[k,document.getElementById(k).checked]));
    await browser.runtime.sendMessage({type:'save',settings});
    status.textContent='Salvo. Recarregue as abas abertas para aplicar.';
    if(reload) {
      const [tab]=await browser.tabs.query({active:true,currentWindow:true});
      if(tab?.id!==undefined) await browser.tabs.reload(tab.id);
      status.textContent='Salvo. Recarregamento solicitado para esta aba.';
    }
  } catch(e) { status.textContent='Não foi possível concluir: '+errorText(e); }
  finally {busy(false);}
}
document.getElementById('save').onclick=()=>save(false);
document.getElementById('reload').onclick=()=>save(true);
document.getElementById('reset').onclick=()=>{show(globalThis.GRAPHITE_DEFAULTS);status.textContent='Tudo selecionado. Clique em Salvar para aplicar.';};
document.getElementById('disable-all').onclick=()=>{show(Object.fromEntries(keys.map(k=>[k,false])));status.textContent='Tudo desmarcado. Clique em Salvar para aplicar.';};
async function takeCapture(saveAs){
  busy(true);
  try {
    const [tab]=await browser.tabs.query({active:true,currentWindow:true});
    if(!Number.isInteger(tab?.id))throw new Error('Nenhuma aba disponível.');
    status.textContent='Preparando PNG da área visível…';
    const result=await browser.runtime.sendMessage({type:'capture',tabId:tab.id,saveAs});
    if(!result.ok)throw new Error(result.error);
    status.textContent=saveAs?'PNG encaminhado para salvamento.':'Download do PNG iniciado na pasta padrão.';
  } catch(e){status.textContent='Captura não concluída: '+errorText(e);}
  finally{busy(false);}
}
document.getElementById('capture').onclick=()=>takeCapture(true);
document.getElementById('capture-quick').onclick=()=>takeCapture(false);
busy(true);
browser.runtime.sendMessage({type:'get'}).then(({settings})=>{
  show(settings);status.textContent='Salve para aplicar nas próximas páginas.';busy(false);
}).catch(e=>{status.textContent='Falha ao carregar: '+errorText(e);});
