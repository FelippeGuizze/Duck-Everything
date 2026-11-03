const {firefox}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch{res.writeHead(404).end()}});
const code=f=>fs.readFileSync(path.join(root,'extension',f),'utf8');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const browser=await firefox.launch();let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++};
try{
for(const mode of ['off','on','custom']){
const page=await browser.newPage();
if(mode!=='off')await page.addInitScript({content:code('seed.js')+(mode==='custom'?code('off/clipboard.js')+code('off/absolute.js')+code('off/focus.js'):'')+code('core.js')});
await page.goto(url+'/lab/');await page.click('#clipboard');
const log=await page.locator('#log').textContent();eq(log.includes('copy: preventDefault=true'),mode!=='on');eq(log.includes('paste: preventDefault=true'),mode==='off');
eq(await page.locator('#selection').evaluate(e=>getComputedStyle(e).userSelect),mode==='off'?'none':'text');
if(mode!=='off'){await page.click('#start');eq(await page.evaluate(()=>!!document.fullscreenElement),true);eq(await page.evaluate(()=>!!document.querySelector(':fullscreen')),false);await page.click('#exit');eq(await page.evaluate(()=>document.fullscreenElement),null);}
await page.click('#blur');eq((await page.locator('#log').textContent()).includes('Site recebeu blur'),mode!=='on');
await page.close();
}
const popup=await browser.newPage({viewport:{width:380,height:570}});
await popup.addInitScript(()=>{window.browser={runtime:{sendMessage:async m=>({settings:window.DUCK_DEFAULTS})},tabs:{query:async()=>[{id:1}],reload:async()=>{}}};});
await popup.goto(url+'/extension/popup.html');await popup.waitForFunction(()=>!document.getElementById('save').disabled);
eq(await popup.locator('input:checked').count(),12);eq(await popup.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true);
eq(await popup.evaluate(()=>document.body.scrollHeight<=innerHeight),true);
eq(await popup.locator('header img, footer').count(),0);
await popup.click('#disable-all');eq(await popup.locator('input:checked').count(),0);
await popup.click('#reset');eq(await popup.locator('input:checked').count(),12);
// Firefox can initially open a browser-action popup with a tiny viewport.
// Its document must keep its intrinsic height so the browser can expand it.
await popup.setViewportSize({width:380,height:150});
eq(await popup.locator('body').evaluate(e=>Math.round(e.getBoundingClientRect().height)),570);
eq(await popup.locator('section').evaluate(e=>e.getBoundingClientRect().height>150),true);
eq(await popup.locator('#disable-all').evaluate(e=>e.getBoundingClientRect().bottom<=570),true);
await popup.setViewportSize({width:380,height:570});
await popup.evaluate(()=>document.getElementById('status').textContent='Erro de teste muito longo. '.repeat(1000));
eq(await popup.locator('#status').evaluate(e=>e.scrollHeight>e.clientHeight),true);
eq(await popup.locator('#status').evaluate(e=>e.getBoundingClientRect().height),40);
eq(await popup.locator('#disable-all').evaluate(e=>e.getBoundingClientRect().bottom<=570),true);
await popup.locator('#status').evaluate(e=>e.scrollTop=e.scrollHeight);
eq(await popup.locator('#status').evaluate(e=>e.scrollTop>0),true);
await popup.evaluate(()=>document.getElementById('status').textContent='Salve para aplicar nas próximas páginas.');
await popup.screenshot({path:path.join(root,'panel-preview.png')});await popup.click('#save');eq((await popup.locator('#status').textContent()).startsWith('Salvo'),true);
console.log(checks+' browser assertions PASS. Firefox '+browser.version()+'. MAIN implementation via addInitScript and popup mocked API; extension installation not tested.');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
