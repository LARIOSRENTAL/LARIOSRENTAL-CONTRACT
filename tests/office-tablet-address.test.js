const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../app-v84/www');
for(const name of ['cliente.html','cliente-v2.html','cliente-v3.html','cliente-v4.html']){
 const html=fs.readFileSync(path.join(root,name),'utf8');
 const dom=new JSDOM(html,{url:'https://example.invalid/'+name,runScripts:'outside-only'}),w=dom.window,d=w.document;
 let submitted=null,alerts=[];
 let poll;
 w.scrollTo=()=>{};w.alert=x=>alerts.push(x);w.setInterval=fn=>{poll=fn;return 1};w.clearInterval=()=>{};
 w.HTMLCanvasElement.prototype.getContext=()=>({scale(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});
 w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,test';
 w.LARIOS_CONFIG={supabaseUrl:'https://test.invalid',supabasePublishableKey:'test-only'};
 const snapshot={customer_phone:'600123123',customer_email:'test@example.invalid',customer_address:'Rue Test 10, Paris 75001',customer_address_parts:{street:'Rue Test',number:'10',city:'Paris',postal_code:'75001'},total:100,franchise:400};
 w.XMLHttpRequest=class{
  open(_,url){this.url=url}setRequestHeader(){}
  send(body){const b=JSON.parse(body);let data=true;
   if(this.url.endsWith('tablet_poll'))data={job_id:'test-job',payload:snapshot};
   if(this.url.endsWith('tablet_submit'))submitted=b.p_response;
   this.status=200;this.readyState=4;this.responseText=JSON.stringify(data);this.onreadystatechange();
  }
 };
 const helper=html.match(/<script src="([^"?]+address[^"?]+\.js)/)[1];
 w.eval(fs.readFileSync(path.join(root,helper),'utf8'));
 const setParts=w.LariosAddress.setParts;let failOnce=true;
 w.LariosAddress.setParts=p=>{if(failOnce){failOnce=false;throw new Error('simulated temporary screen failure')}return setParts(p)};
 const inline=[...d.querySelectorAll('script:not([src])')].map(s=>s.textContent).join('\n');w.eval(inline);
 assert.match(d.getElementById('pairStatus').textContent,/Could not open details/);poll();
 const $=id=>d.getElementById(id),input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}))};
 assert.equal($('customer_address_line').value,'Rue Test 10');assert.equal($('customer_address_city_postal').value,'Paris 75001');
 assert.equal(d.querySelectorAll('#lrCustomerAddress input').length,2);assert.equal($('customer_address').hidden,true);
 assert.match($('customer_address_city_postal').parentElement.textContent,/Ciudad \/ código postal · City \/ postal code/);
 input('customer_address_city_postal','');w.goStep(2);assert.equal(alerts.length,1,'City/postcode must be filled');
 input('customer_address_line','12 High Street');input('customer_address_city_postal','London SW1A 1AA');
 w.goStep(2);w.goStep(3);assert.match($('reviewRows').textContent,/12 High Street/);assert.match($('reviewRows').textContent,/London SW1A 1AA/);
 w.confirmData();$('terms').checked=true;
 // Exercise the actual pointer handlers to satisfy existing signature checks.
 w.goStep(4);
 // setupCanvas is scheduled: run it immediately for this isolated test.
 // Its regular timer is flushed through a patched setTimeout before opening again.
 w.setTimeout=fn=>{fn();return 1};w.goStep(4);
 const event={preventDefault(){},clientX:1,clientY:1};$('sig').onmousedown(event);$('sig').onmousemove({...event,clientX:2});$('sig').onmouseup(event);
 w.submitAll();assert(submitted,'Tablet submit must carry the response');
 assert.equal(submitted.customer_phone,'600123123');assert.equal(submitted.customer_email,'test@example.invalid');
 assert.equal(submitted.customer_address,'12 High Street, London SW1A 1AA');
 assert.equal(submitted.customer_address_parts.street,'High Street');assert.equal(submitted.customer_address_parts.number,'12');
 assert.equal(submitted.customer_address_parts.city,'London');assert.equal(submitted.customer_address_parts.postal_code,'SW1A 1AA');
 w.close();console.log('PASS',name,'hydrate, bilingual fields, validation, signature and structured submit');
}
