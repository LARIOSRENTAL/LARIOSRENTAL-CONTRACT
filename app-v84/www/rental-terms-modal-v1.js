(function(){
 'use strict';
 let panel=null,language='es',previousFocus=null;
 function setLanguage(value){
  language=value==='en'?'en':'es';
  if(!panel)return;
  panel.dataset.language=language;
  panel.querySelectorAll('[data-terms-language]').forEach(button=>{
   const active=button.dataset.termsLanguage===language;
   button.setAttribute('aria-pressed',String(active));
  });
  const image=panel.querySelector('.lrTermsPage');
  if(image){image.style.transform=language==='en'?'translateX(-50%)':'translateX(0)';image.alt=language==='en'?'Rental agreement general conditions in English':'Condiciones generales del contrato en español'}
  panel.querySelector('.lrTermsTitle').textContent=language==='en'?'General conditions':'Condiciones generales';
 }
 function close(){if(!panel)return;panel.remove();panel=null;document.body.style.overflow='';document.removeEventListener('keydown',onKey);previousFocus?.focus?.()}
 function onKey(event){if(event.key==='Escape')close()}
 function open(){
  if(panel){panel.remove();panel=null}
  previousFocus=document.activeElement;
  panel=document.createElement('div');panel.className='lrTermsOverlay';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Condiciones generales / General conditions');
  panel.innerHTML='<section class="lrTermsDialog"><header class="lrTermsHeader"><div><h2 class="lrTermsTitle"></h2><p>Segunda página del contrato / Second page of the rental agreement</p></div><button type="button" class="lrTermsClose" aria-label="Cerrar / Close">×</button></header><nav class="lrTermsLanguages" aria-label="Idioma / Language"><button type="button" data-terms-language="es">Español</button><button type="button" data-terms-language="en">English</button></nav><div class="lrTermsViewport"><img class="lrTermsPage" alt=""></div><footer class="lrTermsFooter"><a href="https://www.lariosrental.com/condiciones-generales/" target="_blank" rel="noopener">Consultar las condiciones completas en la web / View the full conditions online</a></footer></section>';
  const style=document.createElement('style');style.textContent='.lrTermsOverlay{position:fixed;inset:0;z-index:100600;background:#111827b8;display:flex;align-items:center;justify-content:center;padding:12px;font-family:system-ui,-apple-system,sans-serif}.lrTermsDialog{width:min(900px,100%);height:min(94dvh,1000px);background:#fff;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 70px #0005}.lrTermsHeader{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-bottom:1px solid #e5e7eb;gap:12px}.lrTermsHeader h2{font-size:19px;margin:0;color:#111827}.lrTermsHeader p{font-size:12px;color:#6b7280;margin:3px 0 0}.lrTermsClose{border:0;border-radius:50%;width:40px;height:40px;background:#f3f4f6;font-size:27px;color:#111827;flex:0 0 auto}.lrTermsLanguages{display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid #e5e7eb}.lrTermsLanguages button{flex:1;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;padding:10px;font-weight:700}.lrTermsOverlay[data-language="es"] [data-terms-language="es"],.lrTermsOverlay[data-language="en"] [data-terms-language="en"]{background:#166534;color:#fff;border-color:#166534}.lrTermsViewport{flex:1;overflow:auto;overscroll-behavior:contain;background:#fff}.lrTermsPage{display:block;width:200%;max-width:none;height:auto;transition:transform .15s ease}.lrTermsFooter{padding:10px 14px;border-top:1px solid #e5e7eb;text-align:center;font-size:13px}.lrTermsFooter a{color:#166534;font-weight:700}.lrTermsOverlay:focus{outline:none}@media(max-width:600px){.lrTermsOverlay{padding:0}.lrTermsDialog{height:100dvh;max-height:none;border-radius:0}.lrTermsHeader{padding-top:calc(12px + env(safe-area-inset-top))}}';
  panel.appendChild(style);
  const image=panel.querySelector('.lrTermsPage');image.src=new URL('assets/rental-terms-page2.png',document.baseURI).href;
  panel.querySelector('.lrTermsClose').addEventListener('click',close);
  panel.querySelectorAll('[data-terms-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.termsLanguage)));
  panel.addEventListener('click',event=>{if(event.target===panel)close()});
  document.body.appendChild(panel);document.body.style.overflow='hidden';document.addEventListener('keydown',onKey);setLanguage(language);panel.querySelector('.lrTermsClose').focus();
 }
 window.LariosRentalTerms={open,close,setLanguage};
})();
