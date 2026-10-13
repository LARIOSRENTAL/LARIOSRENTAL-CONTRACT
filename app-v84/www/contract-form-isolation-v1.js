(function(){
'use strict';
let activeId=null,sequence=0;
const $=id=>document.getElementById(id);
const definitions=['additional_driver','child_seat','carplay','gps','pdf','booster','gloves','bike_seat','phone_holder'];
function resetSignature(){
  for(const id of ['signatureCanvas','signatureFull']){
    const canvas=$(id);
    if(canvas&&canvas.getContext)canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  }
}
function extrasFor(record){
  const payload=record?.app_payload||{};
  const detail=Array.isArray(record?.extras_detail)?record.extras_detail:
    Array.isArray(payload.extras_detail)?payload.extras_detail:[];
  return detail;
}
function applyExtras(record){
  const selected=extrasFor(record);
  const byKey=new Map(selected.filter(x=>x&&x.key).map(x=>[String(x.key),x]));
  for(const key of definitions){
    const item=byKey.get(key);
    for(const prefix of ['v2_','fx_','extra_']){
      const checkbox=$(prefix+key);
      if(!checkbox)continue;
      checkbox.checked=!!item;
      const qty=$(prefix+key+'_qty');
      if(qty)qty.value=item?String(Math.max(1,Number(item.qty)||1)):'1';
      const price=$(prefix+key+'_price');
      if(price){
        if(item&&item.manual===true&&Number.isFinite(Number(item.unit))){
          price.value=Number(item.unit).toFixed(2);
          price.dataset.manualPrice='1';
        }else{
          delete price.dataset.manualPrice;
          if(!item)price.value='';
        }
      }
    }
  }
  for(let i=1;i<=2;i++){
    const item=byKey.get('custom'+i);
    const name=$('v2_custom'+i+'_name'),qty=$('v2_custom'+i+'_qty'),price=$('v2_custom'+i+'_price');
    if(name)name.value=item?String(item.label||''):'';
    if(qty)qty.value=item?String(Math.max(1,Number(item.qty)||1)):'1';
    if(price)price.value=item?String(item.unit??0):'';
  }
  const field=$('accessories_notes');
  if(field&&selected.length===0)field.value='';
  const first=$('v2_carplay')||$('v2_child_seat')||$('v2_additional_driver');
  if(first)first.dispatchEvent(new Event('change',{bubbles:true}));
}
function onOpened(event){
  const record=event.detail?.record,id=String(record?.id||event.detail?.id||'');
  if(!record||!id)return;
  const changed=id!==activeId;
  activeId=id;
  const request=++sequence;
  if(changed)resetSignature();
  // The extras table can be rebuilt by the existing contract flow shortly after opening.
  for(const delay of [0,260]){
    setTimeout(()=>{
      if(request!==sequence||String(window.LariosCurrentContractId||'')!==id)return;
      applyExtras(record);
      if(changed)resetSignature();
    },delay);
  }
}
document.addEventListener('larios:reservation-opened',onOpened);
})();