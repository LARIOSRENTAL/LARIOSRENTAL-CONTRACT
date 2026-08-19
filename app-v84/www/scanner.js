window.LariosScanner=(function(){
  let target='identity';
  let lastFile=null;
  let lastPath=null;
  const $=id=>document.getElementById(id);

  function isNative(){
    return !!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform());
  }
  function plugin(name){
    return window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins[name];
  }
  function setState(message){
    const el=$('scanState');
    if(el)el.textContent=message||'';
  }

  function open(kind){
    target=kind==='keys'?'keys':'identity';
    const title=$('scanTitle');
    const help=$('scanHelp');
    if(title)title.textContent=target==='keys'?'Fotografiar llavero':'Escanear documentación';
    if(help)help.textContent=target==='keys'
      ?'Haz una foto nítida de la etiqueta completa de las llaves. La app intentará detectar matrícula, grupo y combustible.'
      :'Haz una foto nítida del DNI, pasaporte o permiso de conducir.';
    const scan=$('scan');
    const reservation=$('reservation');
    if(scan)scan.classList.remove('hidden');
    if(reservation)reservation.classList.add('hidden');
    setState(isNative()?'Cámara y reconocimiento nativo preparados.':'Modo web: usa la cámara o fototeca del iPad.');
  }

  function close(){
    const scan=$('scan');
    const reservation=$('reservation');
    if(scan)scan.classList.add('hidden');
    if(reservation)reservation.classList.remove('hidden');
  }

  async function choose(){
    if(isNative()&&plugin('Camera')){
      try{
        const photo=await plugin('Camera').getPhoto({
          quality:92,
          allowEditing:false,
          resultType:'uri',
          source:'CAMERA',
          direction:'REAR',
          correctOrientation:true
        });
        if(!photo||!photo.webPath)throw new Error('La cámara no devolvió una imagen.');
        const preview=$('scanPreview');
        if(preview){preview.src=photo.webPath;preview.classList.remove('hidden');}
        setState('Foto tomada. Reconociendo texto…');
        const blob=await (await fetch(photo.webPath)).blob();
        lastFile=new File([blob],'capture.'+(photo.format||'jpeg'),{type:blob.type||'image/jpeg'});
        await recognize(photo.path||photo.webPath);
        return;
      }catch(e){
        setState('No se pudo usar la cámara nativa: '+e.message+'. Usa el selector de imagen.');
      }
    }
    const input=$('scanFile');
    if(input){input.value='';input.click();}
  }

  async function selected(input){
    const file=input&&input.files&&input.files[0];
    if(!file)return;
    lastFile=file;
    const preview=$('scanPreview');
    const url=URL.createObjectURL(file);
    if(preview){preview.src=url;preview.classList.remove('hidden');}
    setState('Imagen capturada. Puedes guardarla y revisar los datos detectados.');
    if(isNative())await recognize(url);
  }

  async function recognize(path){
    try{
      const tr=plugin('TextRecognition');
      if(!tr)throw new Error('ML Kit no está disponible en esta compilación');
      const result=await tr.processImage({path:path});
      const text=(result&&result.text)?result.text:'';
      if(!text)throw new Error('No se detectó texto legible');
      const area=$('scanText');
      if(area)area.value=text;
      setState('Texto reconocido en el dispositivo. Revisa los datos antes de aplicarlos.');
      apply(false);
    }catch(e){
      setState('Reconocimiento automático no disponible: '+e.message+'. Puedes introducir, pegar o dictar el texto manualmente.');
    }
  }

  async function upload(){
    if(!lastFile){alert('Primero haz una foto.');return null;}
    try{
      const ext=(lastFile.name&&lastFile.name.split('.').pop()||'jpg').toLowerCase();
      const uuid=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now());
      lastPath='mobile/'+new Date().toISOString().slice(0,10)+'/'+uuid+'.'+ext;
      const response=await fetch(cfg.supabaseUrl+'/storage/v1/object/documents/'+lastPath,{
        method:'POST',
        headers:{
          apikey:cfg.supabasePublishableKey,
          Authorization:'Bearer '+token,
          'Content-Type':lastFile.type||'image/jpeg',
          'x-upsert':'false'
        },
        body:lastFile
      });
      if(!response.ok)throw new Error(await response.text());
      setState('Foto guardada de forma privada en Supabase Storage.');
      return lastPath;
    }catch(e){
      alert('No se pudo guardar la imagen: '+e.message);
      return null;
    }
  }

  function cleanUpper(value){return String(value||'').replace(/\s/g,'').toUpperCase();}

  function apply(doClose){
    if(typeof doClose==='undefined')doClose=true;
    const area=$('scanText');
    const text=(area&&area.value||'').trim();
    if(!text){
      if(doClose)alert('No hay texto reconocido para aplicar.');
      return;
    }
    const lines=text.split(/\n+/).map(v=>v.trim()).filter(Boolean);

    if(target==='keys'){
      const plate=text.match(/\b\d{4}\s*[BCDFGHJKLMNPRSTVWXYZ]{3}\b/i);
      if(plate&&$('vehicle_plate'))$('vehicle_plate').value=cleanUpper(plate[0]);
      const group=text.match(/(?:GRUPO|GROUP|GRP|G)\s*[:\-]?\s*([A-Z0-9]{1,6})/i);
      if(group&&$('vehicle_group'))$('vehicle_group').value=group[1].toUpperCase();
      const fuel=text.match(/\b(DIESEL|GASOLINA|PETROL|HIBRIDO|HÍBRIDO|HYBRID|ELECTRICO|ELÉCTRICO|ELECTRIC)\b/i);
      if(fuel&&$('fuel_type'))$('fuel_type').value=fuel[1].toUpperCase();
      if($('vehicle_model')&&!$('vehicle_model').value&&lines.length)$('vehicle_model').value=lines[0];
    }else{
      const dni=text.match(/\b\d{8}[A-Z]\b/i);
      const nie=text.match(/\b[XYZ]\d{7}[A-Z]\b/i);
      const passport=text.match(/\b[A-Z]{1,3}\d{5,9}\b/i);
      const documentMatch=dni||nie||passport;
      if(documentMatch&&$('customer_document'))$('customer_document').value=documentMatch[0].toUpperCase();
      const emailMatch=text.match(/[\w.+-]+@[\w.-]+\.[A-Z]{2,}/i);
      if(emailMatch&&$('customer_email'))$('customer_email').value=emailMatch[0];
      const licence=text.match(/(?:PERMISO|LICEN[CS]E|DRIVING\s+LICEN[CS]E)[^A-Z0-9]*([A-Z0-9-]{5,20})/i);
      if(licence&&$('driving_license'))$('driving_license').value=licence[1].toUpperCase();
      if($('customer_name')&&!$('customer_name').value&&lines.length)$('customer_name').value=lines[0];
    }

    if(doClose)close();
  }

  return {open:open,close:close,choose:choose,selected:selected,upload:upload,apply:apply,recognize:recognize};
})();
