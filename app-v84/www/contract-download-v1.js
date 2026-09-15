(function(){
'use strict';
let contracts=[],loading=false,lastLoad=0;
const headers=()=>({apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'});
async function refresh(force=false){if(loading||(!force&&Date.now()-lastLoad<3000))return;loading=true;try{const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_list_contracts',{method:'POST',headers:headers(),body:'{}'});if(r.ok){contracts=await r.json();lastLoad=Date.now()}}finally{loading=false}}
async function record(id){let c=contracts.find(x=>x.id===id);if(!c){await refresh(true);c=contracts.find(x=>x.id===id)}return c||null}
async function pdfBlob(c){if(!c?.pdf_path)throw new Error('Este contrato todavía no tiene PDF guardado.');const safe=c.pdf_path.split('/').map(encodeURIComponent).join('/'),urls=[cfg.supabaseUrl+'/storage/v1/object/authenticated/contracts/'+safe,cfg.supabaseUrl+'/storage/v1/object/contracts/'+safe];for(const url of urls){const r=await fetch(url,{headers:headers()});if(r.ok)return r.blob()}throw new Error('No se pudo recuperar el PDF guardado.')}
async function download(id){try{const c=await record(id);const blob=await pdfBlob(c),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectUrl;a.download=(c.contract_number||'contrato')+'.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000)}catch(e){alert(e.message||String(e))}}
async function printContract(id){
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
const s=document.createElement('style');s.textContent='.lrCpDownload{background:#1d4ed8!important;color:#fff!important}.lrCpActions{gap:7px;flex-wrap:wrap}';document.head.appendChild(s);setInterval(decorate,1200);window.LariosContractDownload={download,print:printContract,refresh,record};
})();
