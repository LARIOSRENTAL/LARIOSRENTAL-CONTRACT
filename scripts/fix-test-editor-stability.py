"""One-time source repair for test/mobile-v84. No database or external API writes.

The expected hashes prevent applying this repair to an unreviewed revision.
Browser regression tests were run with synthetic admin/employee data, never
with live reservations, payment methods, or Renthub requests.
"""
from pathlib import Path
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile

EXPECTED = {
    'reservation-compact-v1.js': 'a26dca81d8c2e028c1c120fe50461b57185ca932cd4e2cbcc67c58f68a45f44b',
    'role-access-v1.js': '813a15aacaca5ffcad58d47bebcb1be5b72b36cd992befd892fc8c25b621eb1a',
    'larios-fixes.js': 'eccac3eea9430e5759a4dcefc2b6a32172be56d658dd0b5195ec772f21fb93c9',
    'v84-corrections.js': 'd20f116f8e93313771ccf33fe1c31f0b053d17ba21e6849efee463d9c5b8d36b',
    'contract-lifecycle-v6.js': '9024df3c3ada4577143f606f19941cbbf01b9e2a4095988c245512e5a513efa0',
    'final-authority.js': 'bef5bfb8787561ff79f91786a4f821a5ac151adff5dd1e5c5e0df2df46b8f52c',
    'index.html': '46dd0c1c8969ac4640f8031004547ab3c619d7fe0b5e2c3b9109b2e57a8f765a',
}


def repair(p):
    f = p / 'reservation-compact-v1.js'
    s = f.read_text()
    s = s.replace("const recalc=()=>{try{window.LariosAutoPricing?.recalculate?.()}catch(e){}try{window.LariosBusinessRules?.recalculate?.()}catch(e){}};", "const recalc=()=>{try{const result=window.LariosAutoPricing?.recalculate?.();result?.catch?.(e=>console.warn('Compact pricing',e))}catch(e){console.warn('Compact pricing',e)}};\nconst setValue=(el,value)=>{if(el&&el.value!==value)el.value=value};\nconst setReadOnly=(el,value)=>{if(el&&el.readOnly!==value)el.readOnly=value};\nconst toggleClass=(el,name,on)=>{if(el&&el.classList.contains(name)!==on)el.classList.toggle(name,on)};")
    s = s.replace("e.readOnly=false;e.disabled=false;e.type='text';e.inputMode='decimal';", "e.type='text';e.inputMode='decimal';")
    s = s.replace("e.dataset.manualPrice='1';e.dataset.priceReady='1'});e.addEventListener('blur'", "e.dataset.manualPrice='1';e.dataset.priceReady='1';e.dataset.editingPrice='1'});e.addEventListener('blur'")
    s = s.replace("e.dataset.priceReady='1';setTimeout(recalc,0)", "e.dataset.priceReady='1';e.dataset.editingPrice='0';setTimeout(recalc,0)")
    s = s.replace("d.className='lrCollapse';", "d.className='lrCollapse wide';")
    s = s.replace("body.className='lrCollapseBody';d.innerHTML='<summary>'+summary", "body.className='lrCollapseBody formGrid';d.innerHTML='<summary>'+summary")
    s = s.replace("cash.value=franchise;pre.value=franchise;cash.readOnly=true;pre.readOnly=true", "setValue(cash,franchise);setValue(pre,franchise);setReadOnly(cash,true);setReadOnly(pre,true)")
    s = s.replace("cash.readOnly=!cashSel.checked;pre.readOnly=!preSel.checked;", "setReadOnly(cash,!cashSel.checked);setReadOnly(pre,!preSel.checked);")
    s = s.replace("old.value=cashSel.checked?money(cash.value):preSel.checked?money(pre.value):'0.00';", "setValue(old,cashSel.checked?money(cash.value):preSel.checked?money(pre.value):'0.00');")
    s = s.replace("hint.textContent=scooter?", "const text=scooter?")
    s = s.replace("hint.classList.toggle('lrDepositRequired',scooter&&!cashSel.checked&&!preSel.checked)", "if(hint.textContent!==text)hint.textContent=text;toggleClass(hint,'lrDepositRequired',scooter&&!cashSel.checked&&!preSel.checked)")
    s = s[:s.index('function patch(){')] + """let patchTimer=0, applying=false, patchCount=0;
const form=$('reservationForm'),section=$('reservation');
const observer=form?new MutationObserver(records=>{
  if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&(
    n.matches?.('input,select,.extrasTable,.contractStep,.formGrid')||
    n.querySelector?.('#rental_price,#deposit,#additional_name,.extrasTable')
  ))))schedulePatch();
}):null;
function observeForm(){if(form)observer?.observe(form,{childList:true,subtree:true})}
function patch(){
  patchTimer=0;
  if(applying||!section||section.classList.contains('hidden'))return;
  applying=true;observer?.disconnect();
  try{patchCount++;installStyles();protectManualPrices();compactOptionalSections();installDeposit();loadDepositForCurrentContract();syncDepositState()}
  catch(e){console.error('Compact reservation controls',e)}
  finally{applying=false;observeForm()}
}
function schedulePatch(){if(!patchTimer&&!applying)patchTimer=setTimeout(patch,0)}
observeForm();
if(section)new MutationObserver(()=>schedulePatch()).observe(section,{attributes:true,attributeFilter:['class']});
if(form)form.addEventListener('change',event=>{
  if(['vehicle_group','full_insurance','franchise','rental_days'].includes(event.target?.id))schedulePatch();
});
window.LariosCompact={version:'20260912-stable2',refresh:schedulePatch,diagnostics:()=>({patchCount})};
schedulePatch();
})();
"""
    s = s.replace("p.deposit_cash=cashSel?", "p.rental_price_manual=$('rental_price')?.dataset.manualPrice==='1';\n        p.insurance_total_manual=$('insurance_total')?.dataset.manualPrice==='1';\n        p.deposit_cash=cashSel?")
    s = s.replace("if(p&&$('lrDepositBox')){", "if(p&&$('lrDepositBox')&&!$('reservation')?.classList.contains('hidden')&&p.id&&p.id===window.LariosCurrentContractId){")
    s = s.replace("const x=await r.json();const cash=", "const x=await r.json();if(id!==window.LariosCurrentContractId||!$('deposit_cash'))return;const cash=")
    f.write_text(s)

    f = p / 'role-access-v1.js'
    s = f.read_text().replace("bar.innerHTML=`", "const identity=`", 1)
    start = s.index('function identityBar()')
    end = s.index('function reservationGuide()', start)
    part = s[start:end].replace("\n}", "\n  if(bar.innerHTML!==identity)bar.innerHTML=identity;\n}", 1)
    s = s[:start] + part + s[end:]
    s = s.replace("footer.textContent=footer.textContent.replace(/ · PERMISOS V\\d+/g,'').trim()+' · PERMISOS V2'", "const text=footer.textContent.replace(/ · PERMISOS V\\d+/g,'').trim()+' · PERMISOS V2';if(footer.textContent!==text)footer.textContent=text")
    f.write_text(s)

    f = p / 'larios-fixes.js'
    s = f.read_text().replace("const result=e.dataset.manualPrice==='1'?current:Number(automatic||0);e.value=money(result);", "const result=e.dataset.manualPrice==='1'?current:Number(automatic||0);if(document.activeElement!==e||e.dataset.editingPrice!=='1')e.value=money(result);")
    s = s.replace("ob.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});", "if($('reservation'))ob.observe($('reservation'),{attributes:true,attributeFilter:['class']});")
    f.write_text(s)
    f = p / 'v84-corrections.js'
    s = f.read_text().replace("ob.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});", "if($('reservation'))ob.observe($('reservation'),{attributes:true,attributeFilter:['class']});")
    f.write_text(s)

    f = p / 'contract-lifecycle-v6.js'
    s = f.read_text()
    old = "const observer=new MutationObserver(()=>{if(!$('reservation')?.classList.contains('hidden'))setTimeout(patchPrices,0);if(document.querySelector('.agendaItem.rich'))setTimeout(()=>ensureAgenda(),0)});observer.observe(document.body,{subtree:true,childList:true});setInterval(()=>{if(!$('reservation')?.classList.contains('hidden'))patchPrices();if(document.querySelector('.agendaItem.rich')&&typeof token!=='undefined'&&token)ensureAgenda()},1400);"
    new = """let priceTimer=0;const schedulePrices=()=>{if(priceTimer)return;priceTimer=setTimeout(()=>{priceTimer=0;if(!$('reservation')?.classList.contains('hidden'))patchPrices()},0)};
const reservation=$('reservation'),form=$('reservationForm'),agenda=$('agenda');
if(reservation)new MutationObserver(schedulePrices).observe(reservation,{attributes:true,attributeFilter:['class']});
if(form)new MutationObserver(records=>{if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&(n.matches?.('input,select')||n.querySelector?.('#rental_price,#v2_additional_driver')))))schedulePrices()}).observe(form,{childList:true,subtree:true});
if(agenda)new MutationObserver(records=>{if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&(n.matches?.('.agendaItem.rich')||n.querySelector?.('.agendaItem.rich')))))decorateAgenda()}).observe(agenda,{childList:true,subtree:true});
"""
    if old not in s:
        raise RuntimeError('Lifecycle observer differs from reviewed source')
    s = s.replace(old, new)
    s = s.replace('if(box)box.innerHTML=`<div class="priceLine"><span>Alquiler', 'if(box){const html=`<div class="priceLine"><span>Alquiler', 1)
    s = s.replace('</b></div>`;return result.total}', '</b></div>`;if(box.innerHTML!==html)box.innerHTML=html}return result.total}', 1)
    s = s.replace("if(el&&x[key]!=null){el.value=money(x[key]);el.dataset.manualPrice='1'}", "if(el&&x[key]!=null){const explicit=x[key+'_manual']===true;if(['rental_price','insurance_total'].includes(key)&&number(x[key])===0&&!explicit){delete el.dataset.manualPrice}else{el.value=money(x[key]);el.dataset.manualPrice='1'}}", 1)
    s = s.replace('authoritativeTotal()}\nfunction patchPrices(){', 'if(window.LariosAutoPricing)window.LariosAutoPricing.recalculate(false);else authoritativeTotal()}\nfunction patchPrices(){', 1)
    f.write_text(s)

    f = p / 'final-authority.js'
    f.write_text(f.read_text().replace('role-access-v1.js?v=4', 'role-access-v1.js?v=4-stability2'))
    f = p / 'index.html'
    s = f.read_text()
    for name in ['larios-fixes.js', 'v84-corrections.js', 'contract-lifecycle-v6.js', 'final-authority.js', 'reservation-compact-v1.js']:
        s = re.sub(r'(src="' + re.escape(name) + r'\?v=)[^"]+', r'\g<1>stability2-20260912', s)
    s = s.replace('Larios Rental Pro · PRUEBAS</h1>', 'Larios Rental Pro · PRUEBAS · ESTABILIDAD 2</h1>')
    s = s.replace('ENTORNO DE PRUEBAS · V8.4</footer>', 'ENTORNO DE PRUEBAS · V8.4 · ESTABILIDAD 2</footer>')
    f.write_text(s)


def main():
    ref = os.environ.get('GITHUB_REF')
    if ref and ref != 'refs/heads/test/mobile-v84':
        raise RuntimeError('This repair is restricted to the TEST branch')
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'app-v84/www')
    if '20260912-stable2' in (root / 'reservation-compact-v1.js').read_text():
        print('Stability repair already applied; nothing changed')
        return
    for name, expected in EXPECTED.items():
        actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f'Review required: {name} has changed ({actual})')
    # Prepare and syntax-check all edits before writing any repository file.
    with tempfile.TemporaryDirectory() as directory:
        stage = Path(directory)
        for name in EXPECTED:
            shutil.copyfile(root / name, stage / name)
        repair(stage)
        for name in EXPECTED:
            if name.endswith('.js'):
                subprocess.run(['node', '--check', str(stage / name)], check=True)
        for name in EXPECTED:
            shutil.copyfile(stage / name, root / name)
            print('Updated', name)


if __name__ == '__main__':
    main()
