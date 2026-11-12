(function(){
'use strict';
const TZ='Europe/Madrid',KEY='lr_kiosk_logout_day';
function madridClock(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return{day:p.year+'-'+p.month+'-'+p.day,minutes:Number(p.hour)*60+Number(p.minute)};
}
function enforceLogout(){
 if(!localStorage.getItem('lr_token'))return;
 const now=madridClock();
 if(now.minutes>=21*60&&localStorage.getItem(KEY)!==now.day){localStorage.setItem(KEY,now.day);window.logout?.(false)}
}
setInterval(enforceLogout,15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)enforceLogout()});
window.addEventListener('focus',enforceLogout);
enforceLogout();
})();