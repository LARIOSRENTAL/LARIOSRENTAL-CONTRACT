"""Browser regression with synthetic fixtures only; every request is intercepted."""
import json,base64,sys,mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=Path(sys.argv[1]).resolve()/'app-v84/www';STATIC=Path(sys.argv[1]).resolve()/'static'
BASE='https://lariosrental.github.io/LARIOSRENTAL-CONTRACT/'
CID='22222222-2222-4222-8222-222222222222';LEGACY='22222222-2222-4222-8222-222222222223'
OUT=Path('qa-results');OUT.mkdir(exist_ok=True)
def run(role):
 errors=[];unexpected=[];requests=[];passed=[]
 record={'id':CID,'contract_number':'LR-900001','status':'draft','vehicle_group':'C','customer_name':'CLIENTE FICTICIO','customer_email':'test@example.invalid','customer_birth_date':'1980-01-01','pickup_at':'2026-09-13T09:00:00+02:00','return_at':'2026-09-14T09:00:00+02:00','pickup_location':'HOTEL PRUEBA','return_location':'HOTEL PRUEBA','rental_days':'1','rental_price':0,'insurance_total':0,'full_insurance':False,'total':0,'deposit':0,'payment_method':'Efectivo','deposit_method':''}
 legacy={**record,'id':LEGACY,'contract_number':'LR-900002','deposit':250};legacy.pop('deposit_method')
 rows=[record,legacy];holds=[];events=[]
 tariffs=[{'id':i,'active':True,'category':c,'franchise':fr,'day_1':price,'day_2':price*1.8,'day_7':price*5,'extra_day':30,'insurance_first_day':15,'insurance_extra_day':10,'season_94_markup':20}for i,(c,fr,price) in enumerate([('Grupo C',600,99),('Grupo A',600,78),('125cc',400,35),('50cc',400,30),('BICICLETA',50,15),('E-BIKE',150,25)],1)]
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  ctx=browser.new_context(viewport={'width':1024,'height':1366},locale='es-ES',timezone_id='Europe/Madrid')
  token='mock.'+base64.urlsafe_b64encode(json.dumps({'app_metadata':{'role':role},'exp':9999999999}).encode()).decode().rstrip('=')+'.mock'
  ctx.add_init_script(f"localStorage.setItem('lr_token',{json.dumps(token)});localStorage.setItem('lr_expires_at','9999999999');")
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept('BANCO-FICTICIO')if d.type=='prompt'else d.accept())
  def route(r):
   u=urlparse(r.request.url);path=u.path
   try:data=json.loads(r.request.post_data or '{}')
   except:data={}
   requests.append({'path':path,'method':r.request.method,'body':data})
   def res(value,code=200):r.fulfill(status=code,content_type='application/json',body=json.dumps(value),headers={'content-range':'0-0/1','Access-Control-Allow-Origin':'*'})
   if u.netloc=='lariosrental.github.io':
    rel=path.removeprefix('/LARIOSRENTAL-CONTRACT/');f=ROOT/(rel or 'index.html')
    if not f.is_file():f=STATIC/rel
    if f.is_file():r.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(f.name)[0]or'application/octet-stream')
    else:r.fulfill(status=404,body='missing fixture')
    return
   if path.endswith('/auth/v1/user'):res({'id':CID,'email':'staff@example.invalid','app_metadata':{'role':role}});return
   if '/rest/v1/' in path:
    name=path.rsplit('/',1)[-1]
    if name=='pricing':res(tariffs);return
    if name=='app_list_contracts':res(rows);return
    if name=='app_contract_record':res(next(x for x in rows if x['id']==data.get('p_contract_id',CID)));return
    if name=='app_save_contract':
     row=next(x for x in rows if x['id']==data['p_payload']['id']);row.update(data['p_payload']);res(row);return
    if name=='preauthorizations':res(holds);return
    if name.startswith('test_'):unexpected.append(path)
    res([]);return
   if path.endswith('/functions/v1/preauthorization'):
    action=data.get('action');target=data.get('contract_id',CID)
    if data.get('environment')!='production':unexpected.append('Wrong environment')
    if action=='status':res({'environment':'production','stripe_configured':False,'terminal_configured':False,'category':next(x for x in rows if x['id']==target)['vehicle_group'],'holds':[h for h in holds if h['contract_id']==target],'events':events});return
    if action=='create' and data['channel']=='bank':
     h={'id':'33333333-3333-4333-8333-333333333333','contract_id':target,'channel':'bank','amount_cents':60000,'authorized_cents':60000,'captured_cents':0,'released_cents':0,'status':'authorized'};holds.append(h);res({'hold':h});return
    if action in ('capture','cancel'):
     h=holds[0];n=data.get('amount_cents',0);h.update(status='captured'if action=='capture'else'canceled',captured_cents=n,released_cents=60000-n);res({'hold':h});return
    unexpected.append(data);res({'error':'Unsupported mock action'},400);return
   if '/functions/v1/' in path:
    if data.get('action')not in (None,'status'):unexpected.append((path,data))
    res({'configured':False,'available':False,'readers':[]});return
   r.abort()
  ctx.route('**/*',route)
  def check(ok,label):
   if not ok:raise AssertionError(label)
   passed.append(label)
  try:
   page.goto(BASE,wait_until='domcontentloaded');page.wait_for_timeout(5000)
   check('REAL' in page.locator('#lrReleaseVersion').inner_text(),'real version')
   page.evaluate('(id)=>LariosReservations.edit(id)',CID);page.wait_for_timeout(1500)
   check(page.locator('#rental_price').input_value()=='99.00','tariff preload')
   for sel in ('#lrCollapse_driver','#lrCollapse_extras'):check(page.locator(sel).count()==1 and not page.locator(sel).evaluate('(e)=>e.open'),'collapsed '+sel)
   page.locator('#rental_price').fill('');page.wait_for_timeout(500);check(page.locator('#rental_price').input_value()=='','clear rental remains empty')
   page.locator('#rental_price').fill('65.4');page.locator('#customer_name').click();page.wait_for_timeout(300);check(page.locator('#rental_price').input_value()=='65.40','manual rental survives blur')
   page.locator('#full_insurance').check();page.wait_for_timeout(300)
   page.locator('#deposit_cash_selected').check();page.wait_for_timeout(300)
   check(page.locator('#deposit_cash').input_value()=='600,00','insured cash base 600')
   check(float(page.locator('#franchise').input_value().replace(',','.'))==0,'insured franchise zero')
   page.locator('#preauth_selected').check();page.wait_for_timeout(300);check(page.locator('#preauthorization').input_value()=='600,00','insured hold base 600')
   check(page.locator('#lrGuaranteePanel').is_visible(),'channel selector')
   payload=page.evaluate('()=>{const p={};LariosGuarantees.serialize(p);return p}')
   check(payload.get('guarantee_flow_version')==1,'new guarantee persistence marker')
   before=page.evaluate('LariosCompact.diagnostics().patchCount');page.wait_for_timeout(1000);after=page.evaluate('LariosCompact.diagnostics().patchCount');check(after-before<4,'no rendering loop')
   page.locator('[data-hold-channel="bank"]').click();page.wait_for_timeout(500)
   check(page.locator('#lrHoldDialog').evaluate('(e)=>e.open'),'bank hold manager opened')
   page.locator('#lrHoldCapture').click();page.locator('#lrHoldAmount').fill('80');page.locator('#lrHoldReason').fill('Motivo ficticio');page.locator('#lrHoldConfirm').click();page.wait_for_timeout(400)
   check(holds[0]['captured_cents']==8000 and holds[0]['released_cents']==52000,'partial bank capture UI')
   page.locator('#lrHoldClose').click();page.evaluate('LariosReservations.close()');page.wait_for_timeout(200);page.evaluate('(id)=>LariosReservations.edit(id)',LEGACY);page.wait_for_timeout(900)
   saved=page.evaluate("()=>{const p={deposit:'0',deposit_method:'',deposit_cash:'0',preauthorization:'0'};LariosGuarantees.serialize(p);return p}")
   check(saved.get('deposit')=='250.00' and 'deposit_method' not in saved,'legacy deposit preserved')
   page.locator('#vehicle_group').select_option('125cc');page.wait_for_timeout(400);page.locator('#deposit_cash_selected').check();page.wait_for_timeout(250)
   check(page.locator('#deposit_cash').input_value()=='400,00','scooter base 400')
   check(not unexpected,'no TEST or unintended payment endpoints')
   check(not errors,'no JS errors')
   print(role,len(passed),'PASS',flush=True)
  finally:
   page.screenshot(path=str(OUT/f'production-{role}.png'),full_page=False)
   (OUT/f'browser-{role}.json').write_text(json.dumps({'role':role,'checks':passed,'errors':errors,'unexpected':unexpected,'requests':requests},indent=2))
   browser.close()
for role in ['admin','employee']:run(role)
