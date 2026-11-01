(function(){
'use strict';
let contracts=[],loading=false,lastLoad=0;
let pdfjsPromise=null,activePreview=null;
const headers=()=>({apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'});
const nativeAndroid=()=>!!window.Capacitor?.isNativePlatform?.()&&String(window.Capacitor?.getPlatform?.()||'').toLowerCase()==='android';
async function refresh(force=false){if(loading||(!force&&Date.now()-lastLoad<3000))return;loading=true;try{const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_list_contracts',{method:'POST',headers:headers(),body:'{}'});if(r.ok){contracts=await r.json();lastLoad=Date.now()}}finally{loading=false}}
async function record(id){let c=contracts.find(x=>x.id===id);if(!c){await refresh(true);c=contracts.find(x=>x.id===id)}return c||null}
async function pdfBlob(c){if(!c?.pdf_path)throw new Error('Este contrato todavía no tiene PDF guardado.');const safe=c.pdf_path.split('/').map(encodeURIComponent).join('/'),urls=[cfg.supabaseUrl+'/storage/v1/object/authenticated/contracts/'+safe,cfg.supabaseUrl+'/storage/v1/object/contracts/'+safe];for(const url of urls){const r=await fetch(url,{headers:headers()});if(r.ok)return r.blob()}throw new Error('No se pudo recuperar el PDF guardado.')}
async function download(id){try{const c=await record(id);const blob=await pdfBlob(c),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectUrl;a.download=(c.contract_number||'contrato')+'.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000)}catch(e){alert(e.message||String(e))}}
async function pdfjs(){
  if(!pdfjsPromise)pdfjsPromise=import(new URL('vendor/pdfjs/pdf.mjs',document.baseURI).href).then(lib=>{
    lib.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.mjs',document.baseURI).href;
    return lib;
  });
  return pdfjsPromise;
}
function closePreview(){
  if(!activePreview)return false;
  activePreview.remove();
  activePreview=null;
  document.body.classList.remove('lrPdfPreviewOpen');
  return true;
}
async function showNativePreview(c,blob){
  closePreview();
  const root=document.createElement('section');
  root.id='lrPdfPreview';
  root.setAttribute('role','dialog');
  root.setAttribute('aria-modal','true');
  const toolbar=document.createElement('header'),back=document.createElement('button'),title=document.createElement('b'),print=document.createElement('button'),pages=document.createElement('main');
  toolbar.className='lrPdfPreviewToolbar';
  back.type='button';back.className='lrPdfPreviewBack';back.textContent='← Volver';back.onclick=closePreview;
  title.textContent='Contrato '+String(c?.contract_number||'');
  print.type='button';print.className='lrPdfPreviewPrint';print.textContent='Imprimir';print.disabled=true;
  print.onclick=()=>{const name='Contrato '+String(c?.contract_number||'Larios Rental');if(window.LariosAndroidPrint?.printDocument)window.LariosAndroidPrint.printDocument(name);else window.print()};
  pages.className='lrPdfPreviewPages';
  toolbar.append(back,title,print);root.append(toolbar,pages);document.body.appendChild(root);
  activePreview=root;document.body.classList.add('lrPdfPreviewOpen');
  const lib=await pdfjs(),doc=await lib.getDocument({data:await blob.arrayBuffer()}).promise;
  for(let number=1;number<=doc.numPages;number++){
    const page=await doc.getPage(number),base=page.getViewport({scale:1});
    const cssWidth=Math.max(280,Math.min(window.innerWidth-20,900)),cssScale=cssWidth/base.width;
    const renderScale=cssScale*Math.min(window.devicePixelRatio||1,2),viewport=page.getViewport({scale:renderScale});
    const wrap=document.createElement('article'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});
    wrap.className='lrPdfPreviewPage';canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    canvas.style.width=Math.round(base.width*cssScale)+'px';canvas.style.height=Math.round(base.height*cssScale)+'px';
    wrap.appendChild(canvas);pages.appendChild(wrap);
    await page.render({canvasContext:ctx,viewport}).promise;
  }
  print.disabled=false;
  return root;
}
async function printContract(id){
  if(nativeAndroid()){
    try{const c=await record(id),blob=await pdfBlob(c);await showNativePreview(c,blob)}
    catch(e){closePreview();alert('No se pudo abrir la previsualización: '+(e.message||String(e)))}
    return;
  }
  const popup=window.open('about:blank','_blank');
  if(popup){try{popup.document.write('<!doctype html><title>Preparando contrato...</title><body style="font-family:Arial;padding:24px">Preparando contrato para imprimir...</body>');popup.document.close()}catch(_){}}
  try{
    const c=await record(id),blob=await pdfBlob(c),objectUrl=URL.createObjectURL(blob);
    if(popup){
      popup.location.replace(objectUrl);
      setTimeout(()=>{try{popup.focus();popup.print()}catch(_){}},1400);
      setTimeout(()=>URL.revokeObjectURL(objectUrl),120000);
      return;
    }
    const frame=document.createElement('iframe');frame.style.position='fixed';frame.style.right='0';frame.style.bottom='0';frame.style.width='1px';frame.style.height='1px';frame.style.border='0';frame.src=objectUrl;document.body.appendChild(frame);frame.onload=()=>setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(_){window.open(objectUrl,'_blank')}setTimeout(()=>{frame.remove();URL.revokeObjectURL(objectUrl)},30000)},500);
  }catch(e){try{popup?.close()}catch(_){}alert(e.message||String(e))}
}
async function decorate(){const panel=document.getElementById('lrContractPanel');if(!panel||panel.classList.contains('hidden'))return;await refresh();document.querySelectorAll('.lrCpRow').forEach(row=>{if(row.querySelector('.lrCpDownload'))return;const number=row.querySelector('header b')?.textContent?.trim(),c=contracts.find(x=>String(x.contract_number||'').trim()===number);if(!c?.pdf_path)return;const actions=row.querySelector('.lrCpActions');if(!actions)return;const b=document.createElement('button');b.className='lrCpDownload';b.textContent='Descargar PDF';b.onclick=()=>download(c.id);actions.prepend(b)})}
const s=document.createElement('style');s.textContent=`
.lrCpDownload{background:#1d4ed8!important;color:#fff!important}.lrCpActions{gap:7px;flex-wrap:wrap}
body.lrPdfPreviewOpen{overflow:hidden}
#lrPdfPreview{position:fixed;inset:0;z-index:2147483647;background:#e5e7eb;display:flex;flex-direction:column;color:#111827}
.lrPdfPreviewToolbar{padding:calc(10px + env(safe-area-inset-top)) 12px 10px;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;background:#111827;color:#fff;box-shadow:0 2px 8px #0004}
.lrPdfPreviewToolbar b{text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lrPdfPreviewToolbar button{border:0;border-radius:10px;padding:11px 14px;font-weight:800;font-size:15px}
.lrPdfPreviewBack{background:#e5e7eb;color:#111827}.lrPdfPreviewPrint{background:#16a34a;color:#fff}.lrPdfPreviewPrint:disabled{opacity:.55}
.lrPdfPreviewPages{flex:1;overflow:auto;padding:10px 0 calc(18px + env(safe-area-inset-bottom));overscroll-behavior:contain}
.lrPdfPreviewPage{width:max-content;max-width:100%;margin:0 auto 12px;background:#fff;box-shadow:0 2px 12px #0003}
.lrPdfPreviewPage canvas{display:block;max-width:100%;height:auto!important}
@media print{
  body>*:not(#lrPdfPreview){display:none!important}
  #lrPdfPreview{position:static!important;display:block!important;background:#fff!important}
  .lrPdfPreviewToolbar{display:none!important}.lrPdfPreviewPages{overflow:visible!important;padding:0!important}
  .lrPdfPreviewPage{margin:0!important;box-shadow:none!important;break-after:page;page-break-after:always}
  .lrPdfPreviewPage:last-child{break-after:auto;page-break-after:auto}
  .lrPdfPreviewPage canvas{width:100%!important;max-width:none!important}
}
`;document.head.appendChild(s);setInterval(decorate,1200);window.LariosContractDownload={download,print:printContract,refresh,record,closePreview,showNativePreview};
})();
