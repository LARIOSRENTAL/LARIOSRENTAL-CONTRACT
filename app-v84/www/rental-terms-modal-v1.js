(function(){
 'use strict';
 const languages={
  es:{label:'Español',title:'Condiciones generales',url:'https://www.lariosrental.com/condiciones-generales/'},
  en:{label:'English',title:'Rental Agreement Conditions',url:'https://www.lariosrental.com/en/rental-agreement-conditions/'},
  fr:{label:'Français',title:'Conditions de location',url:'https://www.lariosrental.com/fr/conditions-de-location/'},
  de:{label:'Deutsch',title:'Mietvertragsbedingungen',url:'https://www.lariosrental.com/de/mietvertragsbedingungen/'},
  it:{label:'Italiano',title:'Condizioni generali',url:'https://www.lariosrental.com/it/condizioni-generali/'}
 };
 let panel=null,language='es',previousFocus=null;
 function setLanguage(value){
  language=languages[value]?value:'es';
  if(!panel)return;
  panel.dataset.language=language;
  const item=languages[language],frame=panel.querySelector('.lrTermsFrame');
  panel.querySelector('.lrTermsTitle').textContent=item.title;
  panel.querySelector('.lrTermsLanguage').value=language;
  panel.querySelector('.lrTermsOpenPage').href=item.url;
  frame.title=item.title;
  if(frame.src!==item.url)frame.src=item.url;
 }
 function close(){if(!panel)return;panel.remove();panel=null;document.body.style.overflow='';document.removeEventListener('keydown',onKey);previousFocus?.focus?.()}
 function onKey(event){if(event.key==='Escape')close()}
 function open(){
  if(panel){panel.remove();panel=null}
  previousFocus=document.activeElement;
  panel=document.createElement('div');panel.className='lrTermsOverlay';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Términos y condiciones / Terms and conditions');
  panel.innerHTML='<section class="lrTermsDialog"><header class="lrTermsHeader"><div class="lrTermsHeading"><label for="lrTermsLanguage">Idioma / Language</label><select class="lrTermsLanguage" id="lrTermsLanguage"><option value="es">Español</option><option value="en">English</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="it">Italiano</option></select><h2 class="lrTermsTitle"></h2></div><button type="button" class="lrTermsClose" aria-label="Cerrar / Close">×</button></header><div class="lrTermsViewport"><iframe class="lrTermsFrame" loading="eager" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen"></iframe></div><footer class="lrTermsFooter"><span>Texto publicado en la web oficial de Larios Rental.</span> <a class="lrTermsOpenPage" target="_blank" rel="noopener">Abrir esta versión en una pestaña completa</a></footer></section>';
  const style=document.createElement('style');style.textContent='.lrTermsOverlay{position:fixed;inset:0;z-index:100600;background:#111827b8;display:flex;align-items:center;justify-content:center;padding:12px;font-family:system-ui,-apple-system,sans-serif}.lrTermsDialog{width:min(1100px,100%);height:min(96dvh,1100px);background:#fff;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 70px #0005}.lrTermsHeader{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid #e5e7eb;gap:12px}.lrTermsHeading{display:grid;grid-template-columns:auto minmax(160px,240px);align-items:center;gap:6px 10px;flex:1}.lrTermsHeading label{font-size:13px;font-weight:700;color:#374151}.lrTermsLanguage{width:100%;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#111827;padding:9px 10px;font-size:16px}.lrTermsHeader h2{grid-column:1/-1;font-size:17px;margin:0;color:#111827}.lrTermsClose{border:0;border-radius:50%;width:40px;height:40px;background:#f3f4f6;font-size:27px;color:#111827;flex:0 0 auto}.lrTermsViewport{flex:1;min-height:0;background:#fff}.lrTermsFrame{display:block;width:100%;height:100%;border:0;background:#fff}.lrTermsFooter{padding:8px 12px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280}.lrTermsFooter a{display:inline-block;color:#166534;font-weight:700;margin-left:6px}.lrTermsOverlay:focus{outline:none}@media(max-width:600px){.lrTermsOverlay{padding:0}.lrTermsDialog{height:100dvh;max-height:none;border-radius:0}.lrTermsHeader{padding-top:calc(10px + env(safe-area-inset-top))}.lrTermsHeading{grid-template-columns:auto minmax(130px,1fr)}.lrTermsFooter{padding-bottom:calc(8px + env(safe-area-inset-bottom))}}';
  panel.appendChild(style);
  panel.querySelector('.lrTermsClose').addEventListener('click',close);
  panel.querySelector('.lrTermsLanguage').addEventListener('change',event=>setLanguage(event.target.value));
  panel.addEventListener('click',event=>{if(event.target===panel)close()});
  document.body.appendChild(panel);document.body.style.overflow='hidden';document.addEventListener('keydown',onKey);setLanguage(language);panel.querySelector('.lrTermsClose').focus();
 }
 window.LariosRentalTerms={open,close,setLanguage};
})();
