const assert=require('node:assert/strict');
const fields=require('../app-v84/www/quick-reservation-fields-v1.js');

function parse(message){return fields.clean(message,{pickup_location:message,return_location:message,customer_name:'Pendiente',reservation_detail:''})}

const street=parse('10:00 g a callejon de olleria 1dia city expert +34 600 000 001 Pierre');
assert.equal(street.pickup_location,'callejon de olleria');
assert.equal(street.return_location,street.pickup_location);
assert.equal(street.agency,'CITY EXPERT');
assert.equal(street.customer_name,'Pierre');
assert.equal(street.customer_phone,'+34 600 000 001');

const partnerOnly=parse('10:00 g b 2 dias cister city expert +34 600 000 001');
assert.equal(partnerOnly.pickup_location,'City Expert cister');
assert.equal(partnerOnly.customer_name,'Pendiente Larios Rental');
assert.equal(partnerOnly.agency,'CITY EXPERT');

const twoPhones=parse('Sabado 9:00 g a Pasaje Don Valentín Martínez, 9- Casa Mari +34 600 000 001/+34 600 000 002 city expert');
assert.equal(twoPhones.pickup_location,'Pasaje Don Valentín Martínez 9- Casa Mari');
assert.doesNotMatch(twoPhones.return_location,/600 000/);
assert.equal(twoPhones.customer_name,'Pendiente Larios Rental');

const separateAddress=parse('Hoy 11:00 2-125 ofi 3 días city expert cister');
assert.equal(separateAddress.pickup_location,'ofi');
assert.equal(separateAddress.agency,'CITY EXPERT');
assert.equal(separateAddress.customer_name,'Pendiente Larios Rental');

const addressWithCister=parse('10:00 g b 2 dias calle Cister 5 city expert +34 600 000 001 María');
assert.equal(addressWithCister.pickup_location,'calle Cister 5');
assert.equal(addressWithCister.customer_name,'María');

const hotel=parse('10:00 g b 2 dias Hotel Molina Lario +34 600 000 001 María');
assert.equal(hotel.agency,'Hotel Molina Lario');
assert.equal(hotel.pickup_location,'Hotel Molina Lario');
assert.equal(hotel.customer_name,'María');

const bro=fields.clean('11:00 g b bro 405 un día',{pickup_location:'bro',return_location:'bro',customer_name:'Pendiente',reservation_detail:'405'});
assert.equal(bro.agency,'HOTEL BRO');
assert.equal(bro.pickup_location,'HOTEL BRO');
assert.equal(bro.customer_name,'Pendiente Larios Rental');

const itineraryMessage=`Seat Ibiza - Modelo C.
Del: 1 de Noviembre - Recogida en AGP
Al: 5 de Noviembre - Devuelve en AGP
Total: 4 días.
Vuelo del 1 de Noviembrre: SN3735 (llegada a las 14.30h)
Vuelo del 5 de Noviembre: LX2115 (salida a las 16:20h.)
_*Dejarán el vehículo sobre las 14:00h. del 5/11._

Nombre: Filip Marest
Teléfono: +32 475 92 07 18

Cristine bedford`;
const itinerary=fields.clean(itineraryMessage,{pickup_location:itineraryMessage,return_location:itineraryMessage,customer_name:'Cristine bedford',reservation_detail:'',vehicle_group:''});
assert.equal(itinerary.customer_name,'Filip Marest');
assert.equal(itinerary.agency,'Cristine Bedfor Guest Houses Málaga');
assert.equal(itinerary.pickup_date,'2026-11-01');
assert.equal(itinerary.pickup_time,'14:30');
assert.equal(itinerary.return_date,'2026-11-05');
assert.equal(itinerary.return_time,'14:00');
assert.equal(itinerary.pickup_location,'AGP');
assert.equal(itinerary.return_location,'AGP');
assert.equal(itinerary.rental_days,'4');
assert.equal(itinerary.vehicle_group,'C');
assert.equal(itinerary.reservation_detail,'Seat Ibiza · Modelo C');

console.log('WhatsApp quick reservation fields: ok');
