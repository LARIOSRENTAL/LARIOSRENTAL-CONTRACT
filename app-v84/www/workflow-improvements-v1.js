(function(){
'use strict';
const $=id=>document.getElementById(id);let record=null,recordId='',resumeTimer=null;
function headers(){return{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'}}
async function rpc(name,body){const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:headers(),body:JSON.stringify(body||{})}),d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.message||d?.error||'No se pudo guardar');return d}
async function loadRecord(id){if(!id)return null;if(recordId===id&&record)return record;record=await rpc('app_contract_record',{p_contract_id:id});recordId=id;return record}
function ensureCashBox(){if($('cash_without_card'))return;const anchor=$('card_expiry')?.closest('label')||$('card_number')?.closest('label');if(!anchor)return;const l=document.createElement('label');l.id='lrCashNoCardLabel';l.className='wide lrCashNoCard';l.innerHTML='<input id="cash_without_card" type="checkbox"> <span><b>Efectivo sin tarjeta</b><small>Marca esta casilla cuando el cliente paga en efectivo y no se guardarán datos de tarjeta.</small></span>';anchor.parentElement?.insertBefore(l,anchor.nextSibling)}
async function hydrate(){ensureCashBox();const id=window.LariosCurrentContractId||'';if(!id)return;try{const r=await loadRecord(id);if(id!==window.LariosCurrentContractId)return;if($('cash_without_card'))$('cash_without_card').checked=r?.cash_without_card===true||String(r?.cash_without_card)==='true';if($('agency')&&!$('agency').value&&r?.agency)$('agency').value=r.agency}catch(e){console.warn('Workflow hydrate',e)}}
function currentStatus(){return recordId===window.LariosCurrentContractId&&record?.status?record.status:'draft'}
async function saveOpenReservation(){const id=window.LariosCurrentContractId||'';if(!id)throw Error('No hay una reserva abierta.');const prior=await loadRecord(id),bridge=window.LariosStripeBridge,p=bridge?.payload?bridge.payload():{...prior};p.id=id;p.status=prior?.status||'draft';p.payment_method=$('payment_method')?.value||p.payment_method||'';p.cash_without_card=!!$('cash_without_card')?.checked;p.agency=$('agency')?.value||prior?.agency||'';const saved=await rpc('app_save_contract',{p_payload:window.LariosWebBooking?.preservePayload(p)||p});record=saved;recordId=saved?.id||id;window.LariosCurrentContractId=recordId;sessionStorage.setItem('lr_resume_contract',recordId);return saved}
async function resumeContract(id){
  if(!id)return;
  sessionStorage.setItem('lr_resume_contract',id);
  clearTimeout(resumeTimer);
  let tries=0;
  const run=async()=>{
    tries++;
    if(!window.LariosReservations?.edit){
      if(tries<12)resumeTimer=setTimeout(run,250);
      else sessionStorage.removeItem('lr_resume_contract');
      return;
    }
    try{
      await window.LariosReservations.edit(id);
      sessionStorage.removeItem('lr_resume_contract');
      setTimeout(hydrate,120);
    }catch(e){
      console.warn('Reabrir reserva',e);
      sessionStorage.removeItem('lr_resume_contract');
    }
  };
  run();
}
async function markDone(id){if(window.LariosAccess?.isAdmin?.()!==true)return alert('Solo los administradores pueden marcar un contrato como ya realizado.');if(!confirm('¿Marcar este contrato como ya realizado manualmente o en Renthub?\n\nNo se generará un PDF nuevo.'))return;try{const r=await loadRecord(id),p={...r,id,status:'confirmed',contract_already_done:true,contract_done_source:'manual_or_renthub'};await rpc('app_save_contract',{p_payload:window.LariosWebBooking?.preservePayload(p)||p});record=null;recordId='';await window.LariosReservations?.loadAgenda?.($('agendaDate')?.value);decorateAgenda()}catch(e){alert('No se pudo marcar el contrato como realizado: '+e.message)}}
function decorateAgenda(){const snap=window.LariosReservations?.getAgendaSnapshot?.();if(!snap)return;const admin=window.LariosAccess?.isAdmin?.()===true,cols=document.querySelectorAll('#agenda .agendaCol'),cards=cols[0]?.querySelectorAll('.agendaItem.rich')||[];(snap.deliveries||[]).forEach((x,i)=>{const c=cards[i];if(!c)return;const done=x.status!=='draft'||x.contract_already_done===true;c.classList.toggle('lrContractDone',done);c.querySelector('.lrAlreadyDone')?.remove();const edit=[...c.querySelectorAll('button')].find(b=>/Editar reserva/i.test(b.textContent||''));if(edit)edit.style.display=''})}
let agendaTimer=0;function scheduleAgenda(){if(!agendaTimer)agendaTimer=setTimeout(()=>{agendaTimer=0;decorateAgenda()},0)}
function reconcileEditorActions(){
  const section=$('reservation');if(!section||section.classList.contains('hidden'))return;
  const all=[...section.querySelectorAll('button')];
  const save=all.find(b=>/Guardar reserva|Guardar cambios/i.test(String(b.textContent||'').trim()));
  const gens=all.filter(b=>/^(Re)?Generar contrato/i.test(String(b.textContent||'').trim()));
  if(gens.length>1){
    const keep=gens.find(b=>b.classList.contains('primary'))||gens[gens.length-1];
    gens.forEach(b=>{if(b!==keep)b.remove()});
  }
  const generate=(gens.find(b=>b.isConnected&&b.classList.contains('primary'))||gens.find(b=>b.isConnected)||[...section.querySelectorAll('button')].find(b=>/^(Re)?Generar contrato/i.test(String(b.textContent||'').trim())));
  const actions=save?.closest('.finalActions,.actions')||generate?.closest('.finalActions,.actions')||save?.parentElement||generate?.parentElement;
  if(!actions)return;

  const current=window.LariosCurrentContractId||'';
  const admin=window.LariosAccess?.isAdmin?.()===true;
  let b=$('lrAlreadyDoneEditor');
  if(!admin||!current){b?.remove();return}

  const form=$('reservationForm');
  const status=form?.dataset.contractStatus||'draft';
  if(status!=='draft'){b?.remove();return}

  if(!b){
    b=document.createElement('button');
    b.id='lrAlreadyDoneEditor';
    b.type='button';
    b.className='lrAlreadyDoneEditor';
    b.textContent='Contrato ya realizado';
    b.dataset.adminOnly='true';
    b.onclick=()=>markDone(window.LariosCurrentContractId);
  }
  if(!b.isConnected){
    if(save)save.insertAdjacentElement('afterend',b);
    else actions.insertBefore(b,generate||actions.firstChild);
  }
}
function ensureAlreadyDoneEditorButton(){reconcileEditorActions()}
function validateContractReady(){if(!String($('customer_name')?.value||'').trim())return'Falta el nombre del cliente.';if(!$('cash_without_card')?.checked&&(!String($('card_number')?.value||'').trim()||!String($('card_expiry')?.value||'').trim()))return'Indica los datos de tarjeta o marca Efectivo sin tarjeta.';const g=String($('vehicle_group')?.value||'').toUpperCase().replace(/^GRUPO\s+/,'');if(['50CC','125CC'].includes(g)&&!$('deposit_cash_selected')?.checked&&!$('preauth_selected')?.checked)return'Para generar el contrato de una moto debes seleccionar Depósito efectivo o Preautorización.';return''}
function boot(){ensureCashBox();const section=$('reservation');let editorTimer=0;const scheduleEditor=()=>{if(editorTimer)return;editorTimer=setTimeout(()=>{editorTimer=0;if(section&&!section.classList.contains('hidden')){hydrate();reconcileEditorActions()}else $('lrAlreadyDoneEditor')?.remove()},50)};if(section)new MutationObserver(scheduleEditor).observe(section,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});document.addEventListener('larios:reservation-opened',scheduleEditor);window.addEventListener('larios:access-ready',scheduleEditor);const agenda=$('agenda');if(agenda)new MutationObserver(scheduleAgenda).observe(agenda,{childList:true,subtree:true});scheduleAgenda();scheduleEditor();const q=new URLSearchParams(location.search),target=q.get('contract_id')||sessionStorage.getItem('lr_resume_contract');if(target)setTimeout(()=>resumeContract(target),700)}
const style=document.createElement('style');style.textContent='.lrCashNoCard{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;background:#f9fafb}.lrCashNoCard input{width:auto;margin-top:3px}.lrCashNoCard span{display:grid;gap:2px}.lrCashNoCard small{color:#6b7280}.lrContractDone{background:#fee2e2!important;border-color:#ef4444!important}.lrContractDone:before{background:#dc2626!important;box-shadow:0 0 0 4px #fee2e2!important}.lrAlreadyDone{display:none!important}.lrAlreadyDoneEditor{color:#991b1b!important;border:1px solid #fecaca!important;background:#fff1f2!important}';document.head.appendChild(style);
window.LariosWorkflow={saveOpenReservation,resumeContract,currentStatus,hydrate,markDone,validateContractReady,version:'workflow-v1'};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
