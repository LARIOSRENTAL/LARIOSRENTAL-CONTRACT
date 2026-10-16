(function(){
'use strict';
var writing=false,hydrated=null;
function $(id){return document.getElementById(id)}
function clean(v){return String(v==null?'':v).replace(/^\s+|\s+$/g,'')}
function join(a,b){return clean(clean(a)+(clean(a)&&clean(b)?' ':'')+clean(b))}
function splitStreet(value){
 var line=clean(value),m=line.match(/^(.+?)(?:\s*,\s*|\s+)(?:n[º°o.]\s*)?(\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?(?:\s+[a-z])?(?:\s*,\s*.+)?)$/i);
 if(m)return{street:clean(m[1]).replace(/,$/,''),number:clean(m[2])};
 m=line.match(/^(\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?)\s+(.+)$/i);
 if(m)return{street:clean(m[2]),number:clean(m[1])};
 m=line.match(/^(.+?)[,\s]+(s\/?n|sin n[uú]mero)$/i);
 return m?{street:clean(m[1]),number:clean(m[2])}:{street:line,number:''};
}
function splitCity(value){
 var line=clean(value),zip='(?:[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2}|[A-Z]\\d[A-Z]\\s*\\d[A-Z]\\d|\\d{4}\\s*[A-Z]{2}|\\d{2,6}(?:[ -]\\d{2,4})?)',m=line.match(new RegExp('^(.+?)[,/\\s]+('+zip+')$','i'));
 if(m)return{city:clean(m[1]).replace(/,$/,''),postal_code:clean(m[2])};
 m=line.match(new RegExp('^('+zip+')[,/\\s]+(.+)$','i'));
 return m?{city:clean(m[2]),postal_code:clean(m[1])}:{city:line,postal_code:''};
}
function read(){
 var line=clean($('customer_address_line').value),location=clean($('customer_address_city_postal').value);
 var street=hydrated&&line===hydrated.street_number?hydrated:splitStreet(line),city=hydrated&&location===hydrated.city_postal?hydrated:splitCity(location);
 return{street:street.street,number:street.number,city:city.city,postal_code:city.postal_code,street_number:line,city_postal:location};
}
function compose(p){return clean(p.street_number||join(p.street,p.number))+(clean(p.street_number||join(p.street,p.number))&&clean(p.city_postal||join(p.city,p.postal_code))?', ':'')+clean(p.city_postal||join(p.city,p.postal_code))}
function sync(){if(writing)return;writing=true;$('customer_address').value=compose(read());writing=false}
function setParts(p){
 ensure();p=p||{};var line=clean(p.street_number)||join(p.street,p.number),location=clean(p.city_postal)||join(p.city,p.postal_code);
 var street=p.street!==undefined?{street:clean(p.street),number:clean(p.number)}:splitStreet(line),city=p.city!==undefined?{city:clean(p.city),postal_code:clean(p.postal_code)}:splitCity(location);
 hydrated={street:street.street,number:street.number,city:city.city,postal_code:city.postal_code,street_number:line,city_postal:location};
 $('customer_address_line').value=line;$('customer_address_city_postal').value=location;sync();
}
function ensure(){
 var legacy=$('customer_address');if(!legacy||$('lrCustomerAddress'))return;
 var box=document.createElement('fieldset'),legend=document.createElement('legend');box.id='lrCustomerAddress';box.style.cssText='border:0;padding:0;margin:0;min-width:0';legend.textContent='Domicilio del cliente / Customer address';box.appendChild(legend);
 var specs=[['line','Calle y número / Street and number','Calle Mayor 12 / 12 High Street'],['city_postal','Ciudad / código postal · City / postal code','Málaga 29001 / London SW1A 1AA']];
 for(var i=0;i<specs.length;i++){
  var label=document.createElement('label'),input=document.createElement('input');label.textContent=specs[i][1];input.id='customer_address_'+specs[i][0];input.placeholder=specs[i][2];input.type='text';input.addEventListener('input',sync);label.appendChild(input);box.appendChild(label);
 }
 legacy.parentNode.insertBefore(box,legacy.nextSibling);legacy.style.display='none';legacy.hidden=true;
}
window.LariosAddress={read:read,setParts:setParts,compose:compose,splitStreet:splitStreet,splitCity:splitCity};
ensure();
})();
