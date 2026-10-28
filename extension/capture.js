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
  if(/access denied|permission/i.test(raw))return 'O navegador recusou o salvamento. Confira as permissões da extensão e tente novamente.';
  return raw.replace(/data:[^\s]+/gi,'[imagem omitida]').replace(/blob:[^\s]+/gi,'[arquivo temporário]').slice(0,220);
}
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
    // Service worker do Chrome não tem URL.createObjectURL; usa o data URL direto.
    if(typeof URL.createObjectURL==='function')objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    const downloadUrl=objectUrl||png;
    // O Chrome não aceita a opção `incognito` na API de downloads — omitimos ela nos dois.
    const downloadId=await browser.downloads.download({
      url:downloadUrl,filename:captureStamp()+'.png',saveAs:saveAs!==false,conflictAction:'uniquify',
    });
    if(objectUrl)captureDownloads.set(downloadId,objectUrl);
    objectUrl=undefined;
    try {
      const [item]=await browser.downloads.search({id:downloadId});
      if(item && ['complete','interrupted'].includes(item.state))releaseCapture(downloadId);
    } catch { /* onChanged still owns cleanup */ }
    return {ok:true,downloadId};
  } catch(e) {return {ok:false,error:captureError(e)};}
  finally {if(objectUrl)URL.revokeObjectURL(objectUrl);capturePending=false;}
}
