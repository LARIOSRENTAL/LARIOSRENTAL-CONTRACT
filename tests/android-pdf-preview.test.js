const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const download=fs.readFileSync(path.join(__dirname,'../app-v84/www/contract-download-v1.js'),'utf8');
const lifecycle=fs.readFileSync(path.join(__dirname,'../app-v84/www/android-lifecycle-v1.js'),'utf8');
const prepare=fs.readFileSync(path.join(__dirname,'../app-v84/scripts/prepare-android-pdf.mjs'),'utf8');
const agenda=fs.readFileSync(path.join(__dirname,'../app-v84/www/agenda-pdf-v1.js'),'utf8');
const kiosk=fs.readFileSync(path.join(__dirname,'../app-v84/www/android-kiosk-v1.js'),'utf8');
const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/android-apk.yml'),'utf8');

assert.match(download,/nativeAndroid\(\)[\s\S]*showNativePreview\(c,blob\)/);
assert.match(download,/!!window\.LariosAndroidPrint/);
assert.match(download,/vendor\/pdfjs\/pdf\.mjs/);
assert.match(download,/LariosAndroidPrint\?\.printDocument/);
assert.match(download,/window\.LariosContractDownload=\{[^}]*closePreview/);
assert.ok(download.indexOf('if(nativeAndroid())')<download.indexOf("window.open('about:blank'"),'Android must be handled before browser popup');
assert.match(lifecycle,/LariosContractDownload\?\.closePreview/);
assert.match(prepare,/addJavascriptInterface\(new LariosAndroidPrint\(\), "LariosAndroidPrint"\)/);
assert.match(prepare,/createPrintDocumentAdapter/);
assert.match(workflow,/node scripts\/prepare-android-pdf\.mjs/);
assert.ok(workflow.indexOf('node scripts/prepare-terminal.mjs') < workflow.indexOf('node scripts/prepare-android-pdf.mjs'),'print bridge must be applied after kiosk preparation');
assert.match(prepare,/registerPlugin\(LariosKioskPlugin\.class\)/);
assert.match(prepare,/LariosKioskController\.resume\(this\)/);
assert.match(prepare,/addJavascriptInterface\(new LariosAndroidKiosk\(\), "LariosAndroidKiosk"\)/);
assert.match(prepare,/getVersion\(\)/);
assert.match(agenda,/!!window\.LariosAndroidPrint/);
assert.match(agenda,/waitPdfPreview/);
assert.match(agenda,/showPdfPreview/);
assert.match(kiosk,/Activar modo kiosco/);
assert.match(kiosk,/disableToSettings/);
assert.match(prepare,/public void onResume\(\)/);
assert.match(workflow,/vendor\/pdfjs\/pdf\.worker\.mjs/);

console.log('Android in-app PDF preview and print bridge: ok');
