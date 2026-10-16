(function(){
'use strict';
const $=id=>document.getElementById(id);
const keys=['street','number','city_postal'];
let writing=false;
function clean(v){return String(v??'').trim()}
function compose(p){return [clean([p.street,p.number].filter(Boolean).join(' ')),clean(p.city_postal)].filter(Boolean).join(', ')}
function read(){return Object.fromEntries(keys.map(k=>[k,clean($('customer_address_'+k)?.value)]))}
function sync(){const legacy=$('customer_address');if(!legacy||writing)return;writing=true;legacy.value=compose(read());legacy.dispatchEvent(new Event('input',{bubbles:true}));writing=false}
function fill(parts){for(const k of keys){const el=$('customer_address_'+k);if(el)el.value=clean(parts[k])}sync()}
function ensure(){
 const legacy=$('customer_address');if(!legacy||$('lrCustomerAddress'))return;
 const box=document.createElement('fieldset');box.id='lrCustomerAddress';box.className='wide';box.style.cssText='border:0;padding:0;margin:0;min-width:0;grid-column:1/-1';
 const legend=document.createElement('legend');legend.textContent='Domicilio del cliente';box.appendChild(legend);
 const grid=document.createElement('div');grid.className='formGrid';
 for(const [key,label,auto] of [['street','Calle','address-line1'],['number','Número','address-line2'],['city_postal','Ciudad / código postal','off']]){
  const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.id='customer_address_'+key;i.placeholder=label;i.autocomplete=auto;i.addEventListener('input',sync);l.appendChild(i);grid.appendChild(l);
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
window.LariosAddress={payload,compose,read};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
