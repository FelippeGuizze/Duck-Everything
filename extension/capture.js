'use strict';
// Runs in the extension background, not in the page. No DOM access or scrolling.
let capturePending=false;
const captureDownloads=new Map();
function releaseCapture(id){
  const url=captureDownloads.get(id);
  if(url){URL.revokeObjectURL(url);captureDownloads.delete(id);}
}
browser.downloads.onChanged.addListener(delta=>{
  if(['complete','interrupted'].includes(delta.state?.current))releaseCapture(delta.id);
});
function captureError(error){
  const raw=String(error?.message||error||'Erro desconhecido');
  if(/cancel/i.test(raw))return 'Salvamento cancelado. Você pode tentar novamente.';
  if(/access denied|permission/i.test(raw))return 'O Firefox recusou o salvamento. Confira as permissões da extensão e tente novamente.';
  return raw.replace(/data:[^\s]+/gi,'[imagem omitida]').replace(/blob:[^\s]+/gi,'[arquivo temporário]').slice(0,220);
}
// Nome do arquivo: só a data e hora locais da captura, ex.: 2026-10-22_14-35-08.png
function captureStamp(d=new Date()){
  const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+'-'+p(d.getMinutes())+'-'+p(d.getSeconds());
}
async function captureSite(tabId, saveAs=true) {
  if(capturePending)return {ok:false,error:'Já existe uma captura em andamento.'};
  capturePending=true;
  let objectUrl;
  try {
    if(!Number.isInteger(tabId))throw new Error('Aba inválida.');
    const tab=await browser.tabs.get(tabId);
    if(!tab.active)throw new Error('Volte para a aba que deseja capturar.');
    const png=await browser.tabs.captureVisibleTab(tab.windowId,{format:'png'});
    const [current]=await browser.tabs.query({active:true,windowId:tab.windowId});
    if(current?.id!==tab.id || current.url!==tab.url)throw new Error('A aba mudou durante a captura. Tente novamente.');
    if(!png.startsWith('data:image/png;base64,'))throw new Error('O navegador não retornou um PNG.');
    const bytes=Uint8Array.from(atob(png.slice(png.indexOf(',')+1)),c=>c.charCodeAt(0));
    objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    const downloadId=await browser.downloads.download({
      url:objectUrl,filename:captureStamp()+'.png',saveAs:saveAs!==false,conflictAction:'uniquify',
      ...(tab.incognito ? {incognito:true} : {})
    });
    captureDownloads.set(downloadId,objectUrl);
    objectUrl=undefined;
    // The download may finish before its Promise resolves; reconcile this race.
    try {
      const [item]=await browser.downloads.search({id:downloadId});
      if(item && ['complete','interrupted'].includes(item.state))releaseCapture(downloadId);
    } catch { /* onChanged still owns cleanup */ }
    return {ok:true,downloadId};
  } catch(e) {return {ok:false,error:captureError(e)};}
  finally {if(objectUrl)URL.revokeObjectURL(objectUrl);capturePending=false;}
}
