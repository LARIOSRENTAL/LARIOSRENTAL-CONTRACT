"""Selective promotion of the approved release; no requests or database writes."""
from pathlib import Path
import shutil, re, sys, json, hashlib, subprocess
APPROVED='0235183bbff9678aea7961407bca0ca34b5aa978'
PRODUCTION='665e7c881150ed4cf752b95b42a827546fcd737a'
FILES=['larios-fixes.js','v84-corrections.js','role-access-v1.js','contract-lifecycle-v6.js','final-authority.js','pricing-autocalc-v2.js','reservation-compact-v1.js','guarantee-panel-v1.js']

def build(root,source):
 out=root/'app-v84/www'; approved=source/'app-v84/www'
 for name in FILES:shutil.copy2(approved/name,out/name)
 f=out/'index.html';s=f.read_text()
 assert 'LARIOS_TEST_ENV' not in s and 'lr_test_token' not in s
 for name in ['larios-fixes.js','v84-corrections.js','contract-lifecycle-v6.js','final-authority.js','pricing-autocalc-v2.js']:
  s=re.sub(r'(src="'+re.escape(name)+r'\?v=)[^"]+',r'\g<1>real-guarantees1-20260913',s)
 s=s.replace('</body>','<script src="reservation-compact-v1.js?v=real-guarantees1-20260913"></script><script src="guarantee-panel-v1.js?v=real-guarantees1-20260913"></script></body>')
 s=s.replace('<h1>Larios Rental Pro</h1>','<h1>Larios Rental Pro</h1><div id="lrReleaseVersion" style="font-size:12px;color:#cbd5e1;margin-top:4px">REAL \u00b7 GARANT\u00cdAS 1</div>')
 f.write_text(s)
 f=out/'reservation-compact-v1.js';s=f.read_text().replace('(?:test_)?app_save_contract','app_save_contract')
 s=s.replace('init={...init,body:JSON.stringify(parsed)};',"if(window.LariosGuarantees?.serialize)window.LariosGuarantees.serialize(p);\n        init={...init,body:JSON.stringify(parsed)};")
 s=s.replace('}catch(e){}\n  return originalFetch(input,init);',"}catch(e){return new Response(JSON.stringify({message:e.message||'No se pudo validar la garantia'}),{status:409,headers:{'Content-Type':'application/json'}})}\n  return originalFetch(input,init);")
 f.write_text(s)
 f=out/'guarantee-panel-v1.js';s=f.read_text().replace('if(!window.LARIOS_TEST_ENV)return;','if(window.LARIOS_TEST_ENV)return;')
 s=s.replace('/functions/v1/test-preauthorization','/functions/v1/preauthorization').replace("environment:'test'","environment:'production'")
 s=s.replace('/rest/v1/test_pricing','/rest/v1/pricing').replace('/rpc/test_app_contract_record','/rpc/app_contract_record').replace('/rest/v1/test_preauthorizations','/rest/v1/preauthorizations')
 for a,b in [(' - PRUEBAS',''),('Lector de pruebas','Lector Stripe'),('P\u00e1gina segura de pruebas','P\u00e1gina segura de Stripe'),('Stripe de PRUEBAS pendiente de configurar. No se usar\u00e1 Stripe real.','Preautorizacion Stripe no disponible. Usa el banco o deposito efectivo.'),('PRUEBAS - NO USAR TARJETAS REALES','OPERACION REAL - revisa importe y contrato'),('Stripe de PRUEBAS','Stripe'),('lectores de PRUEBAS','lectores Stripe'),('tarjeta de PRUEBAS','tarjeta del cliente'),('Garantias TEST','Garantias'),('guarantees1-20260913','real-guarantees1-20260913')]:s=s.replace(a,b)
 s=s.replace('const records=new Map();','const records=new Map(),legacy=new Map();\nlet hydrated=false;')
 s=s.replace('records.set(target,d);if(target!==id||g!==epoch)return;',"records.set(target,d);if(target!==id||g!==epoch)return;hydrated=true;legacy.set(target,(!c?.deposit_method&&Number(c?.deposit)>0)?Number(c.deposit):0);")
 s=s.replace('host=node;id=next;dirty=false;hydrate()','host=node;id=next;dirty=false;hydrated=false;hydrate()')
 s=s.replace("'0.00');text($('lrDepositHint')","'0.00');if(!cash.checked&&!pre.checked&&!dirty&&legacy.get(id))set($('deposit'),Number(legacy.get(id)).toFixed(2));text($('lrDepositHint')")
 s=s.replace("if(h)notice(states[h.status]","if(!h&&!dirty&&legacy.get(id))notice('Deposito anterior: '+money(legacy.get(id)*100)+' EUR. Se conserva hasta que elijas expresamente un tipo de garantia.');if(h)notice(states[h.status]")
 s=s.replace("window.LariosGuarantees={syncForm,open,refreshAll,", """function serialize(p){if(!hydrated)throw Error('Espera a que cargue la garantia antes de guardar.');if(!dirty&&legacy.get(id)&&!$('deposit_cash_selected')?.checked&&!$('preauth_selected')?.checked){for(const k of ['deposit_method','deposit_cash','preauthorization','guarantee_flow_version'])delete p[k];p.deposit=Number(legacy.get(id)).toFixed(2);return}p.guarantee_flow_version=1;}
async function completeReturn(target){try{const data=await update(target);if(data.holds.some(active)){await open(target);message('Anula o liquida la preautorizacion antes de confirmar la devolucion.');return}if(!data.holds.length)throw Error('No se encuentra la preautorizacion. Revisa la garantia antes de confirmar.');if(confirm('La preautorizacion ya esta finalizada. Confirmar la devolucion del vehiculo?'))await window.LariosLifecycle.confirmDeposit(target)}catch(e){alert(e.message)}}
window.LariosGuarantees={syncForm,open,refreshAll,serialize,completeReturn,""")
 f.write_text(s)
 f=out/'contract-lifecycle-v6.js';s=f.read_text()
 anchor="const x=contract(id);if(!x)return;if(number(x.deposit)>0&&!x.deposit_return_confirmed_at)"
 assert anchor in s
 s=s.replace(anchor,"const x=contract(id);if(!x)return;if(x.deposit_method==='preauthorization'&&window.LariosGuarantees){await window.LariosGuarantees.completeReturn(id);return}if(number(x.deposit)>0&&!x.deposit_return_confirmed_at)")
 s=s.replace("if(isReturn&&number(x.deposit)>0){","if(isReturn&&number(x.deposit)>0&&x.deposit_method!=='preauthorization'){")
 f.write_text(s)
 s=(source/'supabase/functions/test-preauthorization/index.ts').read_text()
 s=s.replace('// Separate TEST service: never use production contracts, tokens or live keys.','// Production guarantees only. Independent from rental payments and TEST holds.')
 s=s.replace("const key=()=>{const k=env('STRIPE_TEST_SECRET_KEY')||env('STRIPE_SECRET_KEY');return /^(sk|rk)_test_/.test(k)?k:''};","const key=()=>{const k=env('STRIPE_SECRET_KEY');return env('STRIPE_ENABLED').toLowerCase()==='true'&&/^(sk|rk)_live_/.test(k)?k:''};")
 s=s.replace('STRIPE_TEST_TERMINAL_LOCATION_ID','STRIPE_TERMINAL_LOCATION_ID').replace("environment:'test'","environment:'production'").replace("b.environment!=='test'","b.environment!=='production'")
 s=s.replace('tap_native_required:true','tap_native_required:true,tap_supported:false')
 s=s.replace('pi.livemode!==false','pi.livemode!==true').replace('s.livemode!==false','s.livemode!==true').replace("if(d.livemode===true)throw Error('Respuesta REAL bloqueada')","if(d.livemode===false)throw Error('Respuesta de PRUEBAS bloqueada en produccion')")
 s=s.replace('larios_test','larios_production').replace('lr-test-hold-','lr-prod-hold-')
 for a,b in [('test_preauthorizations','preauthorizations'),('test_preauthorization_events','preauthorization_events'),('test_contracts','contracts'),('test_preauth_command','preauth_command')]:s=s.replace(a,b)
 s=s.replace('/LARIOSRENTAL-CONTRACT/pruebas/','/LARIOSRENTAL-CONTRACT/').replace('PRUEBAS - Garantia','Garantia').replace('Solo PRUEBAS','Solo produccion').replace('de PRUEBAS','de produccion').replace('Terminal TEST','Terminal').replace('Las claves reales estan bloqueadas.','Las claves de pruebas estan bloqueadas.')
 s=s.replace("if(b.action==='create'){","if(b.action==='create'){\n   if(b.channel==='stripe_tap')return reply({error:'Tap to Pay requiere integrar y validar la app nativa. Usa Terminal, Checkout o banco.'},409);")
 s=s.replace("if(b.action==='connection_token'){","if(b.action==='connection_token'){return reply({error:'Tap to Pay no habilitado en esta version'},409); /* reserved native integration */")
 s=s.replace("if(h.channel==='stripe_checkout'){const s=await stripe","if(h.status==='creating'&&Date.now()-Date.parse(h.created_at)>23*60*60*1000)throw Error('Preparacion antigua: verificar primero en Stripe para evitar duplicados');\n   if(h.channel==='stripe_checkout'){const s=await stripe")
 f=root/'supabase/functions/preauthorization/index.ts';f.parent.mkdir(parents=True,exist_ok=True);f.write_text(s)
 s=(source/'tests/test-preauthorization.mjs').read_text().replace('supabase/functions/test-preauthorization/index.ts','supabase/functions/preauthorization/index.ts')
 s=s.replace("'sk_test_fake'","'sk_live_fake'").replace('STRIPE_TEST_SECRET_KEY','STRIPE_SECRET_KEY').replace('STRIPE_TEST_TERMINAL_LOCATION_ID','STRIPE_TERMINAL_LOCATION_ID').replace('const environment={',"const environment={STRIPE_ENABLED:options.enabled??'true',")
 s=s.replace('livemode:false','livemode:true').replace('{livemode:true},{capture_method','{livemode:false},{capture_method').replace('larios_test','larios_production').replace("environment:'test'","environment:'production'").replace("{environment:'production'}","{environment:'test'}")
 s=s.replace("['sk_live_fake','rk_live_fake','', 'unexpected']","['sk_test_fake','rk_test_fake','', 'unexpected']").replace('assert.match(name,/^test_/)',"assert.ok(['contracts','preauthorizations','preauthorization_events'].includes(name))")
 s=s.replace('test_preauth_command','preauth_command').replace('test_contracts','contracts').replace('pi_test_hold','pi_mock_hold')
 s=s.replace("assert.match(p.get('success_url'),/\\/pruebas\\//)","assert.equal(new URL(p.get('success_url')).pathname,'/LARIOSRENTAL-CONTRACT/')")
 s+="\ntest('global disable flag is respected',()=>assert.equal(sandbox({enabled:'false'}).helpers.key(),''));\ntest('Tap creation blocked before external action',async()=>{const s=sandbox();const r=await s.issue('create',{channel:'stripe_tap'});assert.equal(r.status,409);assert.equal(s.calls.length,0)});\n"
 f=root/'tests/production-preauthorization.mjs';f.parent.mkdir(exist_ok=True);f.write_text(s)
 for name in FILES:subprocess.run(['node','--check',str(out/name)],check=True)
 s=(out/'index.html').read_text();assert 'test-env' not in s and 'lr_test_' not in s and 'pruebas/' not in s
 for code in re.findall(r'<script>(.*?)</script>',s,re.S):subprocess.run(['node','--check'],input=code,text=True,check=True)
 for name in ['guarantee-panel-v1.js','reservation-compact-v1.js']:assert '/test_' not in (out/name).read_text() and '/test-' not in (out/name).read_text()
 manifest={'release':'REAL - GARANTIAS 1','approved_test_commit':APPROVED,'previous_production_commit':PRODUCTION,'files':{name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in FILES+['index.html']}}
 (out/'release-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print('Selective release built. No database, payment or Renthub operations executed.')

if __name__=='__main__':build(Path(sys.argv[1]),Path(sys.argv[2]))
