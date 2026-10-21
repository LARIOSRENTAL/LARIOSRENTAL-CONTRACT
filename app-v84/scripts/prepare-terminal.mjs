import fs from 'node:fs';
import path from 'node:path';
const root='node_modules/@capacitor-community/stripe-terminal';
// Guard every patch: dependency upgrades must be reviewed, never silently patched.
function patch(file,before,after){let s=fs.readFileSync(file,'utf8');if(s.includes(after))return;if(!s.includes(before))throw Error('Unexpected Stripe plugin source: '+file);fs.writeFileSync(file,s.replace(before,after))}
const kotlin=root+'/android/src/main/java/com/getcapacitor/community/stripe/terminal/';
const file=kotlin+'StripeTerminal.kt';
let s=fs.readFileSync(file,'utf8');
if(s.includes('val bluetooth = BluetoothAdapter.getDefaultAdapter()')){
 const start=s.indexOf('        val bluetooth = BluetoothAdapter.getDefaultAdapter()');
 const end=s.indexOf('        val listener: TerminalListener',start);
 if(end<0)throw Error('Unexpected Stripe initialization');
 s=s.slice(0,start)+s.slice(end);fs.writeFileSync(file,s);
}
patch(file,'val logLevel = LogLevel.VERBOSE','val logLevel = LogLevel.ERROR');
patch(file,'this.tokenProvider = TokenProvider(','if (this.tokenProvider == null) this.tokenProvider = TokenProvider(');
patch(file,'        Terminal.getInstance()\n    }','        Terminal.getInstance()\n        notifyListeners(TerminalEnumEvent.Loaded.webEventName, emptyObject)\n        call.resolve()\n    }');
patch(file,'Log.d(logTag, readers[0].serialNumber.toString())','if (readers.isEmpty()) return');
patch(file,'        val token = DiscoveryToken()','        discoveredReadersList = emptyList()\n        val token = DiscoveryToken()');
patch(file,'Log.d(logTag, \"Finished discovering readers\")','Log.d(logTag, \"Finished discovering readers\")\n                        if (discoveredReadersList.isEmpty()) call.resolve(JSObject().put(\"readers\", JSArray()))');
patch(file,'Log.d(logTag, e.localizedMessage)','call.reject(e.localizedMessage, e) // Larios: release failed discovery');
patch(file,'CollectPaymentIntentConfiguration.Builder().updatePaymentIntent(true).build()','CollectPaymentIntentConfiguration.Builder().updatePaymentIntent(true).setAllowRedisplay(com.stripe.stripeterminal.external.models.AllowRedisplay.LIMITED).build()');
patch(kotlin+'StripeTerminalPlugin.kt','        } else {\n            requestPermissionForAlias("location", call, "locationPermsCallback")\n        }','        } else {\n            call.reject("Permite el acceso a la ubicación en Ajustes para usar Tap to Pay.")\n        }');
const swift=root+'/ios/Sources/StripeTerminalPlugin/StripeTerminal.swift';
patch(swift,'                self.collectCancelable = Terminal.shared.collectPaymentMethod(paymentIntent) { collectResult, collectError in','                guard let config = try? CollectPaymentIntentConfigurationBuilder().setAllowRedisplay(.limited).setUpdatePaymentIntent(true).build() else { call.reject("Invalid card consent configuration"); return }\n                self.collectCancelable = Terminal.shared.collectPaymentMethod(paymentIntent, collectConfig: config) { collectResult, collectError in');
patch(root+'/android/build.gradle',"'5.8.+'","'5.8.0'");
// Replace all three Stripe artifacts, including after the first guarded replacement.
s=fs.readFileSync(root+'/android/build.gradle','utf8').replaceAll("'5.8.+'","'5.8.0'").replaceAll("'19.2.+'","'19.2.1'");fs.writeFileSync(root+'/android/build.gradle',s);
if(fs.existsSync('android/app/src/main/AndroidManifest.xml')){
 const manifest='android/app/src/main/AndroidManifest.xml';
 s=fs.readFileSync(manifest,'utf8');
 if(!s.includes('android:name=".LariosApplication"'))s=s.replace('<application','<application android:name=".LariosApplication"');
 if(!s.includes('android.permission.ACCESS_FINE_LOCATION'))s=s.replace('<application','<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/><uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/><uses-permission android:name="android.permission.NFC"/><uses-feature android:name="android.hardware.nfc" android:required="false"/><application');
 fs.writeFileSync(manifest,s);
 const dir='android/app/src/main/java/com/lariosrental/management';fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'LariosApplication.java'),'package com.lariosrental.management;\nimport android.app.Application;\nimport com.stripe.stripeterminal.TerminalApplicationDelegate;\npublic class LariosApplication extends Application { @Override public void onCreate() { super.onCreate(); TerminalApplicationDelegate.onCreate(this); } }\n');
 const gradle='android/app/build.gradle';s=fs.readFileSync(gradle,'utf8');if(!s.includes('com.stripe:stripeterminal-core:5.8.0'))s=s.replace('dependencies {','dependencies {\n    implementation \"com.stripe:stripeterminal-core:5.8.0\"');fs.writeFileSync(gradle,s);
 const vars='android/variables.gradle';s=fs.readFileSync(vars,'utf8').replace(/minSdkVersion\s*=\s*\d+/,'minSdkVersion = 26');fs.writeFileSync(vars,s);
}
console.log('Stripe Terminal 5.8.0: initialization, consent and permission patches applied.');
