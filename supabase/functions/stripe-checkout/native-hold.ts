// Called only after Stripe webhook signature verification. Always retrieve current
// Stripe state: an older event must not create a new hold or regress its state.
export async function reconcileNativeHold(db: any, intentId: string, stripe: (path: string)=>Promise<any>) {
 const {data:h,error}=await db.from('preauthorizations').select('*').eq('payment_intent_id',intentId).maybeSingle();
 if(error)throw Error('No se pudo consultar la garantía');if(!h||h.channel!=='stripe_tap')return {ignored:true};
 const pi=await stripe('/v1/payment_intents/'+encodeURIComponent(intentId)+'?expand[]=latest_charge');
 if(pi.id!==h.payment_intent_id||pi.livemode!==true||pi.capture_method!=='manual'||pi.currency!=='eur'||pi.amount!==Number(h.amount_cents)||pi.metadata?.hold_id!==h.id||pi.metadata?.contract_id!==h.contract_id||pi.metadata?.purpose!=='rental_guarantee'||pi.metadata?.environment!=='larios_production')throw Error('Garantía Stripe no válida');
 const d:any={contract_id:h.contract_id,hold_id:h.id,actor_id:h.created_by,status:'pending'};
 const deadline=pi.latest_charge?.payment_method_details?.card_present?.capture_before;if(deadline)d.capture_before=new Date(deadline*1000).toISOString();
 if(pi.status==='requires_capture')Object.assign(d,{status:'authorized',authorized_cents:pi.amount_capturable});
 if(pi.status==='succeeded'){if(!Number.isSafeInteger(pi.amount_received)||pi.amount_received<=0||pi.amount_received>Number(h.amount_cents))throw Error('Importe capturado no válido');Object.assign(d,{status:'captured',authorized_cents:Number(h.amount_cents),captured_cents:pi.amount_received,released_cents:Number(h.amount_cents)-pi.amount_received})}
 if(pi.status==='canceled')Object.assign(d,{status:pi.cancellation_reason==='automatic'?'expired':'canceled',released_cents:Number(h.authorized_cents||0),captured_cents:0});
 const {error:syncError}=await db.rpc('preauth_command',{p_action:'sync',p_data:d});if(syncError)throw Error(syncError.message);
 const methodId=pi.latest_charge?.payment_method_details?.card_present?.generated_card,customer=typeof pi.customer==='string'?pi.customer:pi.customer?.id;
 if(['requires_capture','succeeded'].includes(pi.status)&&pi.setup_future_usage==='off_session'&&pi.metadata?.card_consent==='rental_off_session_v1'&&/^pm_[A-Za-z0-9]+$/.test(methodId||'')&&/^cus_[A-Za-z0-9]+$/.test(customer||'')){
  const method=await stripe('/v1/payment_methods/'+methodId),owner=typeof method.customer==='string'?method.customer:method.customer?.id;
  if(method.type!=='card'||owner!==customer||!/^\d{4}$/.test(method.card?.last4||''))return {status:d.status,reusable:false};
  const {error:saveError}=await db.rpc('save_external_stripe_card',{p_contract_id:h.contract_id,p_actor_id:h.created_by,p_stripe_customer_id:customer,p_payment_method_id:method.id,p_brand:method.card.brand||'card',p_last4:method.card.last4,p_exp_month:method.card.exp_month,p_exp_year:method.card.exp_year});if(saveError)throw Error('Garantía confirmada; registro de tarjeta pendiente');return {status:d.status,reusable:true};
 }
 return {status:d.status,reusable:false};
}
