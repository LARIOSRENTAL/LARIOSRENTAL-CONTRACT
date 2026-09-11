(function(){
'use strict';
function patch(){
  const box=document.getElementById('quickRenthub');
  if(!box||box.dataset.safeMode==='1')return;
  box.dataset.safeMode='1';
  box.checked=false;
  const label=box.closest('label');
  if(label){
    const title=label.querySelector('b');
    const note=label.querySelector('small');
    if(title)title.textContent='Registrar reserva en Renthub (temporalmente opcional)';
    if(note)note.textContent='Déjalo desmarcado para trabajar con normalidad en Larios Rental mientras terminamos el ajuste de Renthub.';
    label.style.borderColor='#facc15';
    label.style.background='#fefce8';
    label.style.color='#713f12';
  }
}
const observer=new MutationObserver(()=>patch());
observer.observe(document.body,{childList:true,subtree:true});
[0,300,1000,2500,5000].forEach(ms=>setTimeout(patch,ms));
})();