(function(root){
'use strict';
// Snapshot of the location names and aliases used by renthub-transfer.
const locations=[{"id":"124","name":"Larios Malaga"},{"id":"6","name":"ALCAZABA PREMIUM"},{"id":"102","name":"LA MUNDIAL APARTAMENTOS"},{"id":"45","name":"Oficentro Apartamentos Suites"},{"id":"120","name":"AUTOCARAVANAS LA CALA"},{"id":"8","name":"Atarazanas Málaga Boutique Hotel"},{"id":"146","name":"PALACIO DE LA TINTA"},{"id":"36","name":"Málaga Centro B&B HOTEL"},{"id":"11","name":"Barceló Málaga"},{"id":"82","name":"Benhostone"},{"id":"136","name":"EUROSTARS MÁLAGA"},{"id":"103","name":"Malaga Feeling Apartment"},{"id":"127","name":"Living Malaga Apart"},{"id":"125","name":"Ibis Hotel Málaga Centro"},{"id":"128","name":"Los flamencos Apart"},{"id":"96","name":"DOMUS HOSTAL"},{"id":"117","name":"Picasso Apartments"},{"id":"75","name":"CAMPER AREA MH EL RINCON (Málaga)"},{"id":"76","name":"CASA EL MORISCO"},{"id":"14","name":"Castillo Santa Catalina"},{"id":"15","name":"Casual del Mar Málaga"},{"id":"83","name":"Chinitas Boutique Bellavista"},{"id":"85","name":"City Expert CISTER"},{"id":"90","name":"City Expert Calle Granada"},{"id":"93","name":"City Expert CALLE GRANADA"},{"id":"88","name":"City Expert Málaga Estación Autobuses"},{"id":"94","name":"City Expert ESTACIÓN AUTOBUSES"},{"id":"89","name":"City Expert Muelle Heredia"},{"id":"92","name":"City Expert MUELLE HEREDIA"},{"id":"126","name":"El Museo Suites"},{"id":"112","name":"El Nogal Home"},{"id":"54","name":"El Riad Andaluz"},{"id":"7","name":"ASTORIA HOTEL"},{"id":"20","name":"DORMA"},{"id":"121","name":"Fay Hotels Victoria Beach (Elimar)"},{"id":"21","name":"Feel Hostels City Center"},{"id":"61","name":"Soho Feel Hostels Malaga"},{"id":"80","name":"Villa Buenavista Malaga"},{"id":"106","name":"Flat Málaga Centro"},{"id":"43","name":"Miramar Gran Hotel"},{"id":"68","name":"Trebol H-A Hotel"},{"id":"22","name":"H10 Croma Málaga"},{"id":"134","name":"HAMPTON BY HILTON"},{"id":"23","name":"Hilton Garden Inn Málaga"},{"id":"24","name":"Holiday Inn Express Malaga Airport"},{"id":"30","name":"Las Acacias Hostal"},{"id":"110","name":"Moscatel Hostal"},{"id":"113","name":"Nomadas Hotel Boutique"},{"id":"25","name":"HOTEL BRO"},{"id":"12","name":"California Hotel"},{"id":"13","name":"Carlos V Hotel"},{"id":"16","name":"Catalonia Hotel"},{"id":"139","name":"Hotel Catalonia Puerta del Mar"},{"id":"17","name":"del Pintor Hotel"},{"id":"18","name":"Hotel Don Curro"},{"id":"97","name":"Don Paco Hotel"},{"id":"98","name":"Elcano Hotel"},{"id":"19","name":"Eliseos Hotel"},{"id":"99","name":"Goartin Hotel"},{"id":"26","name":"Husa Guadalmedina Hotel"},{"id":"101","name":"ibis Budget VELAZQUEZ Hotel"},{"id":"27","name":"Ilunion hotel"},{"id":"70","name":"Larios Málaga Hotel"},{"id":"37","name":"Malaga Palacio AC Hotel by Marriott"},{"id":"116","name":"Picasso Hotel Málaga"},{"id":"39","name":"Málaga Premium Hotel"},{"id":"122","name":"Maria Cristina Hotel"},{"id":"44","name":"Hotel Molina Lario"},{"id":"109","name":"Hotel Monte Victoria"},{"id":"74","name":"Calabahía Hotel Moon Dreams"},{"id":"35","name":"Hotel MS Maestranza"},{"id":"48","name":"Palacete de Álamos Hotel"},{"id":"79","name":"Rincón Sol Hotel"},{"id":"9","name":"Málaga Centro HOTEL"},{"id":"10","name":"Bahía Hotel Soho Boutique"},{"id":"60","name":"Soho Boutique Equitativa Hotel"},{"id":"31","name":"Las Vegas Hotel Soho Boutique"},{"id":"33","name":"Los Naranjos Hotel Soho Boutique"},{"id":"57","name":"Soho Boutique Hotel"},{"id":"58","name":"Soho Boutique Urban Hotel"},{"id":"63","name":"Solymar Hotel"},{"id":"65","name":"Sur Hotel Malaga"},{"id":"29","name":"Vincci Larios Diez Hotel"},{"id":"72","name":"Zenit Hotel Malaga"},{"id":"73","name":"Zeus Hotel"},{"id":"100","name":"ibis budget Málaga Centro"},{"id":"34","name":"Malabar ICON"},{"id":"77","name":"Imo Swiss Golf Beach"},{"id":"28","name":"Imosur Estacion consigna"},{"id":"104","name":"La Casa Azul"},{"id":"5","name":"Oficina Principal [DESCUENTO - 5%] - Málaga Centro, Pasaje Noblejas 8, Málaga, España"},{"id":"32","name":"Lock And Relax -Luggage storage (Centro-Alameda -C1 line)"},{"id":"108","name":"Lodgingmalaga Plaza de la Constitucion"},{"id":"105","name":"Madeinterranea"},{"id":"130","name":"Madeinterranea Suites"},{"id":"95","name":"Club Hispánico"},{"id":"81","name":"Málaga Nostrum"},{"id":"38","name":"Málaga Planners"},{"id":"40","name":"Málaga Sun Apartments"},{"id":"107","name":"MálagaLodge"},{"id":"41","name":"Marbesol"},{"id":"42","name":"Mariposa Hotel 4 estrellas Málaga centro"},{"id":"143","name":"ME MALAGA"},{"id":"78","name":"Motos Cerezo"},{"id":"114","name":"NONO APARTAMENTOS"},{"id":"64","name":"Novotel Suites Málaga Centro"},{"id":"46","name":"Only YOU Hotel Málaga"},{"id":"47","name":"Pacifico Apartments"},{"id":"49","name":"Palacio Solecio"},{"id":"50","name":"Parador de Málaga Gibralfaro"},{"id":"51","name":"Parador de Málaga Golf Club"},{"id":"84","name":"Chinitas Hostal"},{"id":"119","name":"Villa Amalia Suites"},{"id":"52","name":"Petit Palace Plaza Málaga"},{"id":"53","name":"QQ Bikes"},{"id":"55","name":"Room Mate Valeria Hotel"},{"id":"56","name":"Sercotel Rosaleda Málaga"},{"id":"69","name":"Sercotel Tribuna Málaga"},{"id":"59","name":"Soho Boutique Colón Hotel"},{"id":"62","name":"Sol Maestranza"},{"id":"135","name":"Staybridge Suites Malaga"},{"id":"138","name":"Staybridge Suites Malaga"},{"id":"66","name":"Tandem Soho Suites"},{"id":"67","name":"TOC Hostel Málaga"},{"id":"118","name":"Villa Alicia Guest House"},{"id":"71","name":"Vincci Posada del Patio Hotel"},{"id":"86","name":"EASY PARKING MÁLAGA aeropuerto Costa del Sol, aparcamiento CUBIERTO 24h | iPark"},{"id":"2","name":"Oficina Málaga - Aeropuerto"},{"id":"91","name":"Cenacheros house"},{"id":"87","name":"City Expert Cister"},{"id":"140","name":"Cristine Bedfor Guest Houses Málaga"},{"id":"3","name":"Oficina Málaga - Estación de Tren"},{"id":"141","name":"Eurostars Málaga"},{"id":"137","name":"HAMPTON"},{"id":"129","name":"DOMUS HOTEL"},{"id":"145","name":"Hotel Serenay Málaga"},{"id":"131","name":"AUTOCARAVANA LA CALA"},{"id":"142","name":"SERENAY"},{"id":"4","name":"Oficina Málaga - Estación de Cruceros"},{"id":"132","name":"Otra Ubicación - [Indique dirección en -Observaciones-]"}];
const aliases={"ofi":"5","oficina":"5","oficina principal":"5","pasaje noblejas":"5","agp":"2","aeropuerto":"2","ave":"3","estacion":"3","estacion tren":"3","maria zambrano":"3","cruceros":"4","crucero":"4","puerto":"4","posada":"71","vincci posada":"71","vincci posada del patio":"71","miramar":"43","gran hotel miramar":"43","ilunion":"27","rinconsol":"79","rincon sol":"79","california":"12","croma":"22","h10 croma":"22","novotel":"64","only you":"46","palacio tinta":"146","solecio":"49","palacio solecio":"49","atarazanas":"8","guadalmedina":"26","hilton":"23","hilton garden":"23","maestranza":"35","ms maestranza":"35","vegas":"31","las vegas":"31","naranjos":"33","los naranjos":"33","malabar":"34","rosaleda":"56","mariposa":"42","larios 10":"29","larios diez":"29","b&b":"36","bb":"36","barcelo":"11","benhostone":"82","club hispanico":"95","dorma":"20","elimar":"121","hampton":"134","ibis budget":"100","me malaga":"143","bro":"25","hotel bro":"25","cister city":"85","city expert cister":"85","cister":"85","flamencos":"128","casa azul":"104","autocaravanas la cala":"120","camper cala":"120","camper la cala":"120"};
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const phones=/\+\d[\d\s\u00a0().-]{6,}\d|(?<!\d)[679]\d{8}(?!\d)/g;
const special=[
 {name:'CITY EXPERT',re:/\b(?:cister\s*city\s*expert|city\s*expert|cister\s*city|cister)\b/i,branch:/\b(?:cister|calle granada|m[aá]laga estaci[oó]n autobuses|estaci[oó]n autobuses|muelle heredia)\b/i},
 {name:'ELE APARTAMENT',re:/\b(?:ele\s*apart(?:ament|amentos)?|l\s*apart(?:ament|amentos)?)\b/i},
 {name:'SOL MAESTRANZA',re:/\bsol\s+maestranza\b/i},
 {name:'DULCE HOGAR',re:/\bdulce\s+hogar\b/i},
 {name:'INMOSWISS',re:/\b(?:inmoswiss|imo\s*swiss)\b/i},
 {name:'PARQUE FLAT',re:/\bparque\s+flat\b/i}
];
const excluded=/^(?:oficina|larios malaga|otra ubicaci[oó]n|easy parking)/i;
function partner(raw){
 const t=normalize(raw);
 for(const d of special){const m=d.name==='CITY EXPERT'?(raw.match(/\b(?:cister\s*city\s*expert|city\s*expert)\b/i)||raw.match(d.re)):raw.match(d.re);if(m)return{name:d.name,match:m[0],branch:d.branch?.exec(raw)?.[0]||''}}
 const all=[];
 for(const x of locations){if(excluded.test(x.name))continue;const name=normalize(x.name);if(name.length>=6&&new RegExp('(?:^| )'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?: |$)').test(' '+t+' '))all.push({name:x.name,match:x.name,score:name.length})}
 for(const [alias,id] of Object.entries(aliases)){
   if(alias.length<4||/^(?:cister|city expert|ofi|oficina|aeropuerto|agp|ave|puerto|crucero|estacion|maria zambrano)$/.test(alias))continue;
   const loc=locations.find(x=>x.id===id);if(!loc||excluded.test(loc.name))continue;
   if(new RegExp('(?:^| )'+normalize(alias)+'(?: |$)').test(' '+t+' '))all.push({name:loc.name,match:alias,score:normalize(alias).length});
 }
 all.sort((a,b)=>b.score-a.score);
 return all[0]||null;
}
function stripPhone(s){return String(s||'').replace(phones,' ').replace(/(?:\s*[/,;]\s*)+(?=\s|$)/g,' ').replace(/\s+/g,' ').trim()}
function nameAfterPhone(raw,collaborator){
 const matches=[...String(raw||'').matchAll(phones)];if(!matches.length)return'';
 const last=matches[matches.length-1],tail=raw.slice(last.index+last[0].length).trim().replace(/^[/,;\s]+/,'');
 const without=collaborator?tail.replace(collaborator.match,' ').replace(collaborator.branch||'',' ').trim():tail;
 return /^(?:[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,3})$/u.test(without)?without:'';
}
function compactLocation(raw,p){
 let s=String(raw||'').replace(phones,' ').replace(/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g,' ').replace(/\b(?:[01]?\d|2[0-3])\s*[:.：]\s*[0-5]\d\b/g,' ');
 s=s.replace(/\b(?:hoy|ma[nñ]ana|ahora|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/ig,' ')
   .replace(/\b\d+\s*(?:d[ií]as?|d[ií]a|days?|d)\b/ig,' ')
   .replace(/\b(?:un|una)\s+d[ií]a\b/ig,' ')
   .replace(/\b(?:g|grupo|coche)\s*[:\-]?\s*(?:[a-z]|50cc|125cc)\b/ig,' ')
   .replace(/\b\d+\s*[-x]\s*(?:125|50)\b/ig,' ')
   .replace(/\b\d+\s*(?:x|\-)?\s*(?:125\s*cc|50\s*cc|bicis?|bicicletas?|e-?bikes?)\b/ig,' ')
   .replace(/\b(?:125|50)\s*cc\b/ig,' ')
   .replace(/\b\d+(?:[.,]\d+)?\s*€/g,' ');
 const detail=String(p?.reservation_detail||'').trim();if(detail&&/^\d{2,4}$/.test(detail))s=s.replace(new RegExp('(?:^|\\s)'+detail+'(?=\\s|$)'),' ');
 return s.replace(/[|,;]+/g,' ').replace(/(?:\s*\/\s*)+/g,' ').replace(/\s+/g,' ').trim();
}
function clean(raw,p){
 const source=String(raw||''),person=source.match(/(?:^|\n)\s*(?:nombre\s+(?:del\s+)?cliente|cliente)\s*:\s*([^\n]+)/i)?.[1]?.trim()||'';
 const phone=source.match(phones)?.[0]||'';
 const collaborator=partner(source.replace(person||'\u0000',' '));
 let customer=person||nameAfterPhone(source,collaborator)||String(p.customer_name||'').trim();
 if(collaborator&&(!customer||partner(customer)||normalize(collaborator.name).includes(normalize(customer))||normalize(collaborator.branch)===normalize(customer)||/^(?:expert|city|cister)$/i.test(customer)))customer='';
 if(!customer||customer==='Pendiente')customer='Pendiente Larios Rental';
 const verbose=/(?:^|\n)\s*(?:direcci[oó]n de entrega|entrega en)\s*:/i.test(source);
 let location=verbose?stripPhone(p.pickup_location):compactLocation(source,p);
 if(person)location=location.replace(person,' ').trim();
 if(customer!=='Pendiente Larios Rental')location=location.replace(new RegExp('(?:^|\\s)'+customer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=\\s|$)','i'),' ').trim();
 if(collaborator){
   const without=location.replace(collaborator.match,' ').trim();
   const branch=collaborator.branch;
   let other=without.replace(/[ ,;|]+/g,' ').replace(/\b(?:de|del)\s*$/i,'').trim();
   if(branch&&other&&normalize(other)!==normalize(branch))other=other.replace(new RegExp('\\s+'+branch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i'),' ').trim();
   if(other&&normalize(other)!==normalize(branch)){const tokens=other.split(/\s+/);if(tokens.length>1&&/^(?:ofi|oficina)$/i.test(tokens[0])&&partner(tokens.slice(1).join(' ')))other=tokens[0];location=other}else if(/city expert/i.test(collaborator.name)&&branch){location='City Expert '+branch}else location=collaborator.match;
   p.agency=collaborator.name;
 }
 location=location.replace(/(?:^|\s)[/,;]+|[/,;]+$/g,' ').replace(/\s+/g,' ').trim();
 const room=location.match(/\s+(\d{2,4})$/);if(room&&partner(location.slice(0,-room[0].length))){p.reservation_detail=p.reservation_detail||room[1];location=location.slice(0,-room[0].length).trim()}
 p.pickup_location=location||stripPhone(p.pickup_location)||collaborator?.match||'';
 p.return_location=verbose&&p.return_location&&normalize(p.return_location)!==normalize(p.pickup_location)?stripPhone(p.return_location):p.pickup_location;
 p.customer_name=customer;
 if(phone)p.customer_phone=phone;
 phones.lastIndex=0;if(phones.test(String(p.reservation_detail||'')))p.reservation_detail='';
 return p;
}
root.LariosQuickFields={clean,partner,stripPhone};
if(typeof module!=='undefined')module.exports=root.LariosQuickFields;
})(typeof window!=='undefined'?window:globalThis);
