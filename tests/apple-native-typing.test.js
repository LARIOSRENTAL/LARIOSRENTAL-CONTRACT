const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const {JSDOM}=require('jsdom');
async function check(platform,userAgent,maxTouchPoints){
 const dom=new JSDOM('<form id="reservationForm"><input id="customer_name"><input id="vehicle_plate"></form>',{runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 for(const [k,v] of Object.entries({platform,userAgent,maxTouchPoints}))Object.defineProperty(w.navigator,k,{value:v});
 w.eval(fs.readFileSync(path.join(__dirname,'../app-v84/www/uppercase-fields-v1.js'),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const el=w.document.getElementById('customer_name');el.focus();el.value='José';el.setSelectionRange(2,2);el.dispatchEvent(new w.InputEvent('input',{bubbles:true,inputType:'insertText'}));assert.equal(el.value,'José','iOS input stays native while focused');assert.equal(el.selectionStart,2);
 el.dispatchEvent(new w.Event('compositionend',{bubbles:true}));assert.equal(el.value,'José','composition must not rewrite active iOS input');assert.equal(el.style.textTransform,'uppercase','text still appears in uppercase');
 el.blur();assert.equal(el.value,'JOSÉ','completed field retains uppercase normalization');
 const plate=w.document.getElementById('vehicle_plate');plate.focus();plate.value='1234abc';plate.dispatchEvent(new w.InputEvent('input',{bubbles:true}));assert.equal(plate.value,'1234ABC','plate matching still receives uppercase live');
 await new Promise(r=>setTimeout(r,60));plate.blur();await new Promise(r=>setTimeout(r,60));
}
(async()=>{await check('iPhone','Mozilla iPhone',5);await check('MacIntel','Mozilla Macintosh Safari',5);console.log('iPhone and iPad native typing checks passed')})().catch(e=>{console.error(e);process.exitCode=1});
