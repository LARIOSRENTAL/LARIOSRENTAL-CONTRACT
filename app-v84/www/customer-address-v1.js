(function(){
'use strict';
const $=id=>document.getElementById(id);
let writing=false,hydrated=null;
function clean(v){return String(v??'').trim()}
function streetLine(p){return clean(p.street_number)||clean([p.street,p.number].filter(Boolean).join(' '))}
function cityLine(p){return clean(p.city_postal)||clean([p.city,p.postal_code].filter(Boolean).join(' '))}
function compose(p){return [streetLine(p),cityLine(p)].filter(Boolean).join(', ')}
function splitStreet(value){
 const line=clean(value);
 // Recognise house numbers at either end, retaining apartment/floor text with the number.
 const tail=line.match(/^(.+?)(?:\s*,\s*|\s+)(?:n[º°o.]\s*)?(\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?(?:\s+[a-z])?(?:\s*,\s*.+)?)$/i);
 if(tail)return {street:clean(tail[1]).replace(/,$/,''),number:clean(tail[2])};
 const head=line.match(/^(\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?)\s+(.+)$/i);
 if(head)return {street:clean(head[2]),number:clean(head[1])};
 const noNumber=line.match(/^(.+?)[,\s]+(s\/?n|sin n[uú]mero)$/i);
 if(noNumber)return {street:clean(noNumber[1]),number:clean(noNumber[2])};
 return {street:line,number:''};
}
function splitCity(value){
 const line=clean(value);
 // UK, Canadian, Dutch and numeric international postal codes, before or after the city.
 const zip='(?:[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2}|[A-Z]\\d[A-Z]\\s*\\d[A-Z]\\d|\\d{4}\\s*[A-Z]{2}|\\d{2,6}(?:[ -]\\d{2,4})?)';
 const tail=line.match(new RegExp('^(.+?)[,/\\s]+('+zip+')$','i'));
 if(tail)return {city:clean(tail[1]).replace(/,$/,''),postal_code:clean(tail[2])};
 const head=line.match(new RegExp('^('+zip+')[,/\\s]+(.+)$','i'));
 if(head)return {city:clean(head[2]),postal_code:clean(head[1])};
 return {city:line,postal_code:''};
}
function read(){
 const street_number=clean($('customer_address_line')?.value),city_postal=clean($('customer_address_city_postal')?.value);
 const street=hydrated&&street_number===hydrated.street_number?{street:hydrated.street,number:hydrated.number}:splitStreet(street_number);
 const city=hydrated&&city_postal===hydrated.city_postal?{city:hydrated.city,postal_code:hydrated.postal_code}:splitCity(city_postal);
 return {...street,...city,street_number,city_postal};
}
function sync(){const legacy=$('customer_address');if(!legacy||writing)return;writing=true;legacy.value=compose(read());legacy.dispatchEvent(new Event('input',{bubbles:true}));writing=false}
function fill(parts){
 const line=streetLine(parts),location=cityLine(parts);
 hydrated={...(parts.street!==undefined?{street:clean(parts.street),number:clean(parts.number)}:splitStreet(line)),
  ...(parts.city!==undefined?{city:clean(parts.city),postal_code:clean(parts.postal_code)}:splitCity(location)),street_number:line,city_postal:location};
 $('customer_address_line').value=line;$('customer_address_city_postal').value=location;sync();
}
function ensure(){
 const legacy=$('customer_address');if(!legacy||$('lrCustomerAddress'))return;
 const box=document.createElement('fieldset');box.id='lrCustomerAddress';box.className='wide';box.style.cssText='border:0;padding:0;margin:0;min-width:0;grid-column:1/-1';
 const legend=document.createElement('legend');legend.textContent='Domicilio del cliente / Customer address';box.appendChild(legend);
 const grid=document.createElement('div');grid.className='formGrid';
 for(const [key,label,auto,example] of [['line','Calle y número / Street and number','address-line1','Calle Mayor 12 / 12 High Street'],['city_postal','Ciudad / código postal · City / postal code','address-level2','Málaga 29001 / London SW1A 1AA']]){
  const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.id='customer_address_'+key;i.placeholder=example;i.autocomplete=auto;i.addEventListener('input',sync);l.appendChild(i);grid.appendChild(l);
 }
 box.appendChild(grid);legacy.insertAdjacentElement('afterend',box);legacy.hidden=true;legacy.style.display='none';
 // Existing free-form addresses are preserved verbatim until the user separates them.
 fill({street:legacy.value,number:'',city_postal:''});
 legacy.addEventListener('input',()=>{if(!writing)fill({street:legacy.value,number:'',city_postal:''})});
 legacy.addEventListener('change',()=>{if(!writing)fill({street:legacy.value,number:'',city_postal:''})});
}
function payload(){ensure();return $('lrCustomerAddress')?{customer_address_parts:read()}:{};}
document.addEventListener('larios:reservation-opened',event=>{
 ensure();const record=event.detail?.record;if(!record)return;
 const p=record.customer_address_parts||record.app_payload?.customer_address_parts;
  fill(p&&typeof p==='object'?p:{street:record.customer_address||record.app_payload?.customer_address||'',number:'',city_postal:''});
});
function boot(){ensure();new MutationObserver(ensure).observe(document.body,{childList:true,subtree:true})}
window.LariosAddress={payload,compose,read,splitStreet,splitCity};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
