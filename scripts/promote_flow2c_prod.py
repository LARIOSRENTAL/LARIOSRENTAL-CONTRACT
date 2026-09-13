from pathlib import Path

ROOT = Path('app-v84/www')

def replace_once(path, old, new, label):
    p = ROOT / path
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'{label}: anchor missing in {path}')
    p.write_text(s.replace(old, new, 1))

# 50/125cc can be saved as draft without guarantee. Guarantee remains mandatory when generating contract.
p = ROOT / 'reservation-compact-v1.js'
s = p.read_text()
block = """        if(['50CC','125CC'].includes(String(p.vehicle_group||'').toUpperCase().replace(/^GRUPO\\s+/,''))&&!cashSel&&!preSel){
          return new Response('En motos de 50cc y 125cc debes seleccionar Depósito efectivo o Preautorización.',{status:400,headers:{'Content-Type':'text/plain'}});
        }
"""
if block in s:
    s = s.replace(block, '', 1)
p.write_text(s)

# Stripe payment payload: preserve existing generated status and the new cash/agency fields.
replace_once(
    'stripe-bridge-v1.js',
    "id:window.LariosCurrentContractId||'',status:'draft',",
    "id:window.LariosCurrentContractId||'',status:window.LariosWorkflow?.currentStatus?.()||'draft',",
    'stripe status'
)
replace_once(
    'stripe-bridge-v1.js',
    "payment_method:'Tarjeta',franchise:",
    "payment_method:val('payment_method')||'Tarjeta',cash_without_card:chk('cash_without_card'),agency:val('agency'),franchise:",
    'stripe extended payload'
)

# Payment Checkout must save first and return to the same reservation.
replace_once(
    'payment-methods-v1.js',
    "async function saveDraft(){const b=window.LariosStripeBridge;if(!b?.saveDraft)throw new Error('La reserva aún no está preparada');const d=await b.saveDraft();return d?.id||currentId()}",
    "async function saveDraft(){if(window.LariosWorkflow?.saveOpenReservation){const d=await window.LariosWorkflow.saveOpenReservation();return d?.id||currentId()}const b=window.LariosStripeBridge;if(!b?.saveDraft)throw new Error('La reserva aún no está preparada');const d=await b.saveDraft();return d?.id||currentId()}",
    'payment save first'
)
replace_once(
    'payment-methods-v1.js',
    "sessionStorage.setItem('lr_return_contract',id);status('Abriendo Stripe Checkout…');",
    "sessionStorage.setItem('lr_return_contract',id);sessionStorage.setItem('lr_resume_contract',id);status('Abriendo Stripe Checkout…');",
    'payment resume id'
)
replace_once(
    'payment-methods-v1.js',
    "async function reopen(id){try{if(window.LariosReservations?.loadAgenda)await window.LariosReservations.loadAgenda($('agendaDate')?.value);setTimeout(()=>window.LariosReservations?.edit?.(id),50)}catch(e){console.warn(e)}}",
    "async function reopen(id){try{if(window.LariosWorkflow?.resumeContract)return window.LariosWorkflow.resumeContract(id);if(window.LariosReservations?.loadAgenda)await window.LariosReservations.loadAgenda($('agendaDate')?.value);setTimeout(()=>window.LariosReservations?.edit?.(id),50)}catch(e){console.warn(e)}}",
    'payment reopen same reservation'
)

# Preauthorization must save the open reservation before creating a real hold.
replace_once(
    'guarantee-panel-v1.js',
    "busy=true;syncForm();try{await loadTariffs();",
    "busy=true;syncForm();try{await window.LariosWorkflow?.saveOpenReservation?.();await loadTariffs();",
    'preauth save first'
)
# Stripe Checkout preauthorization should leave and return to this reservation, not a blank home screen.
replace_once(
    'guarantee-panel-v1.js',
    "window.open(u.href,'_blank','noopener,noreferrer');message('Al terminar en Stripe, vuelve y pulsa Comprobar estado.');poll(h.contract_id);return",
    "sessionStorage.setItem('lr_resume_contract',h.contract_id);location.assign(u.href);return",
    'preauth checkout navigation'
)
replace_once(
    'guarantee-panel-v1.js',
    "if(target)window.addEventListener('larios:agenda-controls-ready',()=>open(target),{once:true})",
    "if(target){sessionStorage.setItem('lr_resume_contract',target);setTimeout(()=>window.LariosWorkflow?.resumeContract?.(target),500);window.addEventListener('larios:agenda-controls-ready',()=>open(target),{once:true})}",
    'preauth return resume'
)

# Production index: load the validated parser/workflow files and bust caches for modified scripts.
p = ROOT / 'index.html'
s = p.read_text()
s = s.replace('REAL · GARANTÍAS 1.1', 'REAL · FLUJO 2C')
anchor = '<script src="reservation-quick-v2.js?v=1"></script>'
insert = anchor + '<script src="reservation-quick-v3.js?v=flow2c-prod-20260913"></script><script src="reservation-quick-v4.js?v=flow2c-prod-20260913"></script>'
if 'reservation-quick-v3.js' not in s:
    if anchor not in s:
        raise SystemExit('index parser anchor missing')
    s = s.replace(anchor, insert, 1)
s = s.replace('contract-flow-final.js?v=6', 'contract-flow-final.js?v=flow2c-prod-20260913')
s = s.replace('stripe-bridge-v1.js?v=1', 'stripe-bridge-v1.js?v=flow2c-prod-20260913')
s = s.replace('payment-methods-v1.js?v=3', 'payment-methods-v1.js?v=flow2c-prod-20260913')
s = s.replace('reservation-compact-v1.js?v=real-guarantees1-20260913', 'reservation-compact-v1.js?v=flow2c-prod-20260913')
s = s.replace('guarantee-panel-v1.js?v=cycle-qty1-20260913', 'guarantee-panel-v1.js?v=flow2c-prod-20260913')
if 'workflow-improvements-v1.js' not in s:
    s = s.replace('</body>', '<script src="workflow-improvements-v1.js?v=flow2c-prod-20260913"></script></body>', 1)
p.write_text(s)

# Static safety checks.
checks = {
    'index.html': ['REAL · FLUJO 2C', 'reservation-quick-v4.js?v=flow2c-prod-20260913', 'workflow-improvements-v1.js?v=flow2c-prod-20260913'],
    'workflow-improvements-v1.js': ['Efectivo sin tarjeta', 'validateContractReady', 'Contrato ya realizado'],
    'reservation-quick-v4.js': ['scooterInfo', 'madridTime', 'split(raw,p)'],
    'contract-flow-final.js': ['updateExistingContract', 'cash_without_card', 'validateContractReady'],
    'payment-methods-v1.js': ['lr_resume_contract', 'LariosWorkflow?.resumeContract'],
    'guarantee-panel-v1.js': ['saveOpenReservation', 'location.assign(u.href)'],
}
for name, needles in checks.items():
    text = (ROOT / name).read_text()
    for needle in needles:
        if needle not in text:
            raise SystemExit(f'{name}: missing {needle}')

print('Flow 2C production files prepared successfully')
