(function(){
'use strict';
function ensureShell(){
  var scan=document.getElementById('scan');
  if(!scan)return null;
  if(!document.getElementById('scanTitle')||!document.getElementById('scanHelp')||!document.getElementById('scanFile')||!document.getElementById('scanChoose')||!document.getElementById('scanApply')){
    scan.innerHTML='<div class="toolbar"><button class="back" type="button" id="scanBack">←</button><b id="scanTitle">Escanear documentación</b></div>'+
      '<div class="notice" style="border:2px solid #16a34a"><b>SCANNER V6 WEB ACTIVO</b><div id="scanHelp" class="muted" style="margin-top:6px">Preparando escáner…</div></div>'+
      '<input id="scanFile" class="hidden" type="file" accept="image/*" capture="environment">'+
      '<button id="scanChoose" type="button" class="primary" style="width:100%;margin-top:12px">Abrir cámara</button>'+
      '<img id="scanPreview" class="scanPreview hidden" alt="Vista previa">'+
      '<p id="scanState" class="muted">Preparado.</p>'+
      '<div id="scanResult" class="notice" style="margin-top:12px"><b>Esperando captura</b></div>'+
      '<details id="scanDebug" style="margin-top:10px"><summary>Diagnóstico de lectura</summary><pre id="scanRaw" style="white-space:pre-wrap;font-size:11px"></pre></details>'+
      '<button id="scanSave" type="button" class="secondary" style="width:100%;margin-top:12px">Guardar foto privada</button>'+
      '<button id="scanApply" type="button" class="primary" style="width:100%;margin-top:12px">Aplicar al contrato</button>';
  }
  return scan;
}
function install(){
  if(!window.LariosScanner||window.LariosScanner.__openGuardV6)return false;
  var current=window.LariosScanner;
  var originalOpen=current.open;
  current.open=function(kind,who){
    ensureShell();
    try{
      return originalOpen.call(current,kind,who);
    }catch(err){
      console.error('Scanner open guard recovered',err);
      ensureShell();
      var scan=document.getElementById('scan');
      var reservation=document.getElementById('reservation');
      if(scan)scan.classList.remove('hidden');
      if(reservation)reservation.classList.add('hidden');
      var title=document.getElementById('scanTitle');
      if(title)title.textContent=(kind==='keys'||kind==='vehicle')?'Escanear llavero del vehículo':'Escanear documentación';
      var help=document.getElementById('scanHelp');
      if(help)help.innerHTML='<b>Campos del permiso:</b> 1 apellidos · 2 nombre · 3 nacimiento · 4a expedición · 4b caducidad · 5 número de permiso · 8 domicilio (si aparece).<br>El navegador usa OCR web. Revisa los datos antes de aplicarlos.';
      var file=document.getElementById('scanFile');
      var choose=document.getElementById('scanChoose');
      var apply=document.getElementById('scanApply');
      var save=document.getElementById('scanSave');
      var back=document.getElementById('scanBack');
      if(file&&current.selected)file.onchange=function(){current.selected(this)};
      if(choose&&file){var parent=file.parentElement;if(parent&&!parent.dataset.webCameraPicker){var wrap=document.createElement('div');wrap.dataset.webCameraPicker='1';wrap.style.cssText='position:relative;width:100%;min-height:48px';choose.parentNode.insertBefore(wrap,choose);wrap.appendChild(choose);wrap.appendChild(file);file.classList.remove('hidden');file.style.cssText='position:absolute;inset:0;width:100%;height:100%;opacity:0.01;z-index:10;display:block;cursor:pointer';file.onchange=function(){current.selected(this)};}choose.onclick=function(){file.value='';};}
      if(apply&&current.apply)apply.onclick=function(){current.apply();};
      if(save&&current.upload)save.onclick=function(){current.upload();};
      if(back)back.onclick=function(){if(current.close)return current.close();if(scan)scan.classList.add('hidden');if(reservation)reservation.classList.remove('hidden');};
      return true;
    }
  };
  current.__openGuardV6=true;
  var f=document.querySelector('.foot');
  if(f)f.textContent='Larios Rental · V8.4 · Scanner V6 WEB · OPEN FIX';
  return true;
}
window.addEventListener('load',function(){setTimeout(install,1200);});
setTimeout(install,0);
})();