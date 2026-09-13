from pathlib import Path
import subprocess

ROOT=Path('app-v84/www')

def patch(name, old, new, count=1):
    p=ROOT/name
    s=p.read_text()
    if old not in s:
        raise SystemExit(f'{name}: anchor not found: {old[:80]!r}')
    s=s.replace(old,new,count)
    p.write_text(s)

# 1) Load the new parser and workflow controller in TEST only, with a visible marker.
p=ROOT/'index.html'; s=p.read_text()
if 'reservation-quick-v3.js' not in s:
    s=s.replace('<script src="reservation-quick-v2.js?v=1"></script>','<script src="reservation-quick-v2.js?v=1"></script><script src="reservation-quick-v3.js?v=flow2-20260913"></script>',1)
if 'workflow-improvements-v1.js' not in s:
    s=s.replace('</body>','<script src="workflow-improvements-v1.js?v=flow2-20260913"></script></body>',1)
s=s.replace('Larios Rental Pro · PRUEBAS · GARANTÍAS 1','Larios Rental Pro · PRUEBAS · FLUJO 2')
s=s.replace('ENTORNO DE PRUEBAS · V8.4 · GARANTÍAS 1','ENTORNO DE PRUEBAS · V8.4 · FLUJO 2')
p.write_text(s)

# 2) A scooter reservation may be saved as draft without guarantee. The guarantee is checked only at contract generation.
p=ROOT/'reservation-compact-v1.js'; s=p.read_text()
block="""        if(['50CC','125CC'].includes(String(p.vehicle_group||'').toUpperCase().replace(/^GRUPO\\s+/,''))&&!cashSel&&!preSel){
          return new Response('En motos de 50cc y 125cc debes seleccionar Depósito efectivo o Preautorización.',{status:400,headers:{'Content-Type':'text/plain'}});
        }
"""
if block in s: s=s.replace(block,'',1)
p.write_text(s)

# 3) Persist the new cash-without-card and collaborator fields in every save used before Stripe.
p=ROOT/'stripe-bridge-v1.js'; s=p.read_text()
s=s.replace("id:window.LariosCurrentContractId||'',status:'draft',","id:window.LariosCurrentContractId||'',status:window.LariosWorkflow?.currentStatus?.()||'draft',",1)
s=s.replace("payment_method:'Tarjeta',franchise:","payment_method:val('payment_method')||'Tarjeta',cash_without_card:chk('cash_without_card'),agency:val('agency'),franchise:",1)
p.write_text(s)

# 4) Payment flow: save all form data first and always reopen exactly the same reservation after Stripe.
p=ROOT/'payment-methods-v1.js'; s=p.read_text()
old="async function saveDraft(){const b=window.LariosStripeBridge;if(!b?.saveDraft)throw new Error('La reserva aún no está preparada');const d=await b.saveDraft();return d?.id||currentId()}"
new="async function saveDraft(){if(window.LariosWorkflow?.saveOpenReservation){const d=await window.LariosWorkflow.saveOpenReservation();return d?.id||currentId()}const b=window.LariosStripeBridge;if(!b?.saveDraft)throw new Error('La reserva aún no está preparada');const d=await b.saveDraft();return d?.id||currentId()}"
if old not in s: raise SystemExit('payment-methods-v1.js: saveDraft anchor missing')
s=s.replace(old,new,1)
s=s.replace("sessionStorage.setItem('lr_return_contract',id);status('Abriendo Stripe Checkout…');","sessionStorage.setItem('lr_return_contract',id);sessionStorage.setItem('lr_resume_contract',id);status('Abriendo Stripe Checkout…');",1)
old="async function reopen(id){try{if(window.LariosReservations?.loadAgenda)await window.LariosReservations.loadAgenda($('agendaDate')?.value);setTimeout(()=>window.LariosReservations?.edit?.(id),50)}catch(e){console.warn(e)}}"
new="async function reopen(id){try{if(window.LariosWorkflow?.resumeContract)return window.LariosWorkflow.resumeContract(id);if(window.LariosReservations?.loadAgenda)await window.LariosReservations.loadAgenda($('agendaDate')?.value);setTimeout(()=>window.LariosReservations?.edit?.(id),50)}catch(e){console.warn(e)}}"
if old not in s: raise SystemExit('payment-methods-v1.js: reopen anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# 5) Preauthorization flow: save before creating a hold, use same-tab return, and resume same reservation.
p=ROOT/'guarantee-panel-v1.js'; s=p.read_text()
old="busy=true;syncForm();try{await loadTariffs();"
new="busy=true;syncForm();try{await window.LariosWorkflow?.saveOpenReservation?.();await loadTariffs();"
if old not in s: raise SystemExit('guarantee-panel-v1.js: save-before-hold anchor missing')
s=s.replace(old,new,1)
old="window.open(u.href,'_blank','noopener,noreferrer');message('Al terminar en Stripe, vuelve y pulsa Comprobar estado.');poll(h.contract_id);return"
new="sessionStorage.setItem('lr_resume_contract',h.contract_id);location.assign(u.href);return"
if old not in s: raise SystemExit('guarantee-panel-v1.js: checkout resume anchor missing')
s=s.replace(old,new,1)
# If the test return handler exists, make it reopen the reservation rather than leaving the user at home.
old="if(target)window.addEventListener('larios:agenda-controls-ready',()=>open(target),{once:true})"
if old in s:
    s=s.replace(old,"if(target){sessionStorage.setItem('lr_resume_contract',target);setTimeout(()=>window.LariosWorkflow?.resumeContract?.(target),500)}",1)
p.write_text(s)

# 6) Contract generation: require name + card OR cash-without-card, require motorcycle guarantee only at generation,
#    persist collaborator/cash flag, and let Save changes refresh the same generated contract/PDF.
p=ROOT/'contract-flow-final.js'; s=p.read_text()
s=s.replace("payment_method:val('payment_method'),franchise:","payment_method:val('payment_method'),cash_without_card:chk('cash_without_card'),agency:val('agency'),franchise:",1)
s=s.replace("const cardDigits=val('card_number').replace(/\\D/g,'');const d={card_number:cardDigits?'**** '+cardDigits.slice(-4):'',card_expiry:'',","const cardDigits=val('card_number').replace(/\\D/g,'');const d={card_number:chk('cash_without_card')?'EFECTIVO SIN TARJETA':(cardDigits?'**** '+cardDigits.slice(-4):''),card_expiry:'',",1)
old="if(!val('customer_name'))return alert('Falta el nombre del cliente.');const btn="
new="if(!val('customer_name'))return alert('Falta el nombre del cliente.');const flowError=window.LariosWorkflow?.validateContractReady?.()||'';if(flowError)return alert(flowError);const btn="
if old not in s: raise SystemExit('contract-flow-final.js: finalize validation anchor missing')
s=s.replace(old,new,1)
old="function install(){if(!window.LariosReservations||LariosReservations.__finalFlowV2)return;"
new="""async function currentRecord(){if(!editingId)return null;const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/app_contract_record',{method:'POST',headers:{apikey:cfg.supabasePublishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_contract_id:editingId})});if(!r.ok)throw new Error(await r.text());return r.json()}
async function updateExistingContract(current){ensureExtras();syncAdditional();recalcExtras();if(window.LariosValidation?.validate&&!LariosValidation.validate())return;const saved=await saveRpc(payload(current?.status||'confirmed')),pdf=await buildOfficialPdf(saved);await storePdf(saved,pdf.blob);alert('Cambios guardados. Se ha actualizado el mismo contrato '+contractNo(saved)+' y su PDF.');if(window.LariosReservations?.close)LariosReservations.close();setTimeout(()=>{if(typeof changeAgendaDate==='function')changeAgendaDate()},120);return saved}
function install(){if(!window.LariosReservations||LariosReservations.__finalFlowV2)return;"""
if old not in s: raise SystemExit('contract-flow-final.js: install anchor missing')
s=s.replace(old,new,1)
old="LariosReservations.save=function(status){if(status==='confirmed')return finalize();return oldSave(status)}"
new="LariosReservations.save=async function(status){if(status==='confirmed')return finalize();if(status==='draft'&&editingId){try{const current=await currentRecord();if(current&&current.status!=='draft')return updateExistingContract(current)}catch(e){alert('No se pudo actualizar el contrato existente: '+e.message);return}}return oldSave(status)}"
if old not in s: raise SystemExit('contract-flow-final.js: save wrapper anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# 7) Workflow controller: observe dynamically-rendered card controls and intercept generation/save after all earlier wrappers are installed.
p=ROOT/'workflow-improvements-v1.js'; s=p.read_text()
s=s.replace("const agenda=$('agenda');if(agenda)new MutationObserver(scheduleAgenda).observe(agenda,{childList:true,subtree:true});scheduleAgenda();","const agenda=$('agenda');if(agenda)new MutationObserver(scheduleAgenda).observe(agenda,{childList:true,subtree:true});const form=$('reservationForm');if(form)new MutationObserver(()=>{ensureCashBox();if(!$('reservation')?.classList.contains('hidden'))setTimeout(hydrate,20)}).observe(form,{childList:true,subtree:true});scheduleAgenda();",1)
# Inject an outer fetch augmenter so private legacy save functions cannot drop the new fields.
anchor="const style=document.createElement('style');"
if anchor not in s: raise SystemExit('workflow-improvements-v1.js: style anchor missing')
augment="""const priorFetch=window.fetch.bind(window);window.fetch=async function(input,init){try{const url=typeof input==='string'?input:String(input?.url||'');if(/\\/rest\\/v1\\/rpc\\/(?:test_)?app_save_contract(?:\\?|$)/.test(url)&&init?.body){const body=JSON.parse(init.body),p=body?.p_payload;if(p&&p.id&&p.id===window.LariosCurrentContractId){p.cash_without_card=!!$('cash_without_card')?.checked;p.agency=$('agency')?.value||p.agency||'';init={...init,body:JSON.stringify(body)}}}}catch(e){console.warn('Workflow payload',e)}return priorFetch(input,init)};
"""
s=s.replace(anchor,augment+anchor,1)
p.write_text(s)

# Syntax checks for every modified/added JS file.
for name in ['reservation-quick-v3.js','workflow-improvements-v1.js','reservation-compact-v1.js','stripe-bridge-v1.js','payment-methods-v1.js','guarantee-panel-v1.js','contract-flow-final.js']:
    subprocess.run(['node','--check',str(ROOT/name)],check=True)

# Static assertions for the critical behaviors.
index=(ROOT/'index.html').read_text()
assert 'PRUEBAS · FLUJO 2' in index
assert 'reservation-quick-v3.js' in index and 'workflow-improvements-v1.js' in index
assert 'Efectivo sin tarjeta' in (ROOT/'workflow-improvements-v1.js').read_text()
assert 'updateExistingContract' in (ROOT/'contract-flow-final.js').read_text()
assert 'lr_resume_contract' in (ROOT/'payment-methods-v1.js').read_text()
assert 'saveOpenReservation' in (ROOT/'guarantee-panel-v1.js').read_text()
print('workflow improvements v2 patched and syntax checked')
