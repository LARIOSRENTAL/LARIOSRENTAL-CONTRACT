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
patch(file,'                val collectConfig: CollectPaymentIntentConfiguration =','                if (paymentIntent.status == com.stripe.stripeterminal.external.models.PaymentIntentStatus.REQUIRES_CONFIRMATION) {\n                    paymentIntentInstance = paymentIntent\n                    collectCall!!.resolve()\n                    return\n                }\n                val collectConfig: CollectPaymentIntentConfiguration =');
patch(kotlin+'StripeTerminalPlugin.kt','        } else {\n            requestPermissionForAlias("location", call, "locationPermsCallback")\n        }','        } else {\n            call.reject("Permite el acceso a la ubicación en Ajustes para usar Tap to Pay.")\n        }');
const swift=root+'/ios/Sources/StripeTerminalPlugin/StripeTerminal.swift';
patch(swift,'                self.collectCancelable = Terminal.shared.collectPaymentMethod(paymentIntent) { collectResult, collectError in','                guard let config = try? CollectPaymentIntentConfigurationBuilder().setAllowRedisplay(.limited).setUpdatePaymentIntent(true).build() else { call.reject("Invalid card consent configuration"); return }\n                self.collectCancelable = Terminal.shared.collectPaymentMethod(paymentIntent, collectConfig: config) { collectResult, collectError in');
patch(root+'/CapacitorCommunityStripeTerminal.podspec', "s.dependency 'StripeTerminal', '~> 5.8.0'", "s.dependency 'StripeTerminal', '5.8.0'");
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

// Larios Rental dedicated-device kiosk mode.
// Activated only when this package has been provisioned as Android Device Owner.
if(fs.existsSync('android/app/src/main/AndroidManifest.xml')){
 const manifest='android/app/src/main/AndroidManifest.xml';
 let m=fs.readFileSync(manifest,'utf8');
 if(!m.includes('android.permission.RECEIVE_BOOT_COMPLETED'))m=m.replace('<application','<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/><application');
 if(!m.includes('LariosDeviceAdminReceiver')){
  m=m.replace('</application>','<receiver android:name=".LariosDeviceAdminReceiver" android:permission="android.permission.BIND_DEVICE_ADMIN" android:exported="true"><meta-data android:name="android.app.device_admin" android:resource="@xml/larios_device_admin"/><intent-filter><action android:name="android.app.action.DEVICE_ADMIN_ENABLED"/></intent-filter></receiver></application>');
 }
 if(!m.includes('android.intent.category.HOME')){
  const activityAt=m.indexOf('android:name=".MainActivity"');
  if(activityAt<0)throw Error('Cannot locate MainActivity in AndroidManifest.xml');
  const closeAt=m.indexOf('</activity>',activityAt);
  if(closeAt<0)throw Error('Cannot locate MainActivity closing tag');
  const home='<intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.HOME"/><category android:name="android.intent.category.DEFAULT"/></intent-filter>';
  m=m.slice(0,closeAt)+home+m.slice(closeAt);
 }
 fs.writeFileSync(manifest,m);
 const javaDir='android/app/src/main/java/com/lariosrental/management';fs.mkdirSync(javaDir,{recursive:true});
 const xmlDir='android/app/src/main/res/xml';fs.mkdirSync(xmlDir,{recursive:true});
 fs.writeFileSync(path.join(xmlDir,'larios_device_admin.xml'),'<?xml version="1.0" encoding="utf-8"?><device-admin xmlns:android="http://schemas.android.com/apk/res/android"><uses-policies><force-lock/></uses-policies></device-admin>');
 fs.writeFileSync(path.join(javaDir,'LariosDeviceAdminReceiver.java'),[
  'package com.lariosrental.management;',
  'import android.app.admin.DeviceAdminReceiver;',
  'public class LariosDeviceAdminReceiver extends DeviceAdminReceiver {}'
 ].join('\n'));
 fs.writeFileSync(path.join(javaDir,'LariosKioskController.java'),[
  'package com.lariosrental.management;',
  'import android.app.Activity;',
  'import android.app.admin.DevicePolicyManager;',
  'import android.content.ComponentName;',
  'import android.content.Context;',
  'import android.content.Intent;',
  'import android.content.IntentFilter;',
  'public final class LariosKioskController {',
  ' private static DevicePolicyManager dpm(Context c){ return (DevicePolicyManager)c.getSystemService(Context.DEVICE_POLICY_SERVICE); }',
  ' private static ComponentName admin(Context c){ return new ComponentName(c,LariosDeviceAdminReceiver.class); }',
  ' public static boolean isOwner(Context c){ return dpm(c).isDeviceOwnerApp(c.getPackageName()); }',
  ' public static void enter(Activity a){',
  '  if(!isOwner(a)) return;',
  '  DevicePolicyManager d=dpm(a); ComponentName who=admin(a); String pkg=a.getPackageName();',
  '  d.setLockTaskPackages(who,new String[]{pkg});',
  '  d.setLockTaskFeatures(who,DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO|DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS);',
  '  IntentFilter home=new IntentFilter(Intent.ACTION_MAIN);home.addCategory(Intent.CATEGORY_HOME);home.addCategory(Intent.CATEGORY_DEFAULT);',
  '  d.addPersistentPreferredActivity(who,home,new ComponentName(a,MainActivity.class));',
  '  if(d.isLockTaskPermitted(pkg)) try{a.startLockTask();}catch(Exception ignored){}',
  ' }',
  ' public static void exit(Activity a){',
  '  if(!isOwner(a)) return;',
  '  try{a.stopLockTask();}catch(Exception ignored){}',
  '  dpm(a).clearPackagePersistentPreferredActivities(admin(a),a.getPackageName());',
  ' }',
  '}'
 ].join('\n'));
 fs.writeFileSync(path.join(javaDir,'LariosKioskPlugin.java'),[
  'package com.lariosrental.management;',
  'import android.content.Intent;',
  'import android.provider.Settings;',
  'import com.getcapacitor.JSObject;',
  'import com.getcapacitor.Plugin;',
  'import com.getcapacitor.PluginCall;',
  'import com.getcapacitor.PluginMethod;',
  'import com.getcapacitor.annotation.CapacitorPlugin;',
  '@CapacitorPlugin(name="LariosKiosk")',
  'public class LariosKioskPlugin extends Plugin {',
  ' @PluginMethod public void status(PluginCall call){JSObject o=new JSObject();o.put("deviceOwner",LariosKioskController.isOwner(getContext()));o.put("lockTaskPermitted",((android.app.admin.DevicePolicyManager)getContext().getSystemService(android.content.Context.DEVICE_POLICY_SERVICE)).isLockTaskPermitted(getContext().getPackageName()));call.resolve(o);}',
  ' @PluginMethod public void enter(PluginCall call){LariosKioskController.enter(getActivity());call.resolve();}',
  ' @PluginMethod public void exitToSettings(PluginCall call){LariosKioskController.exit(getActivity());Intent i=new Intent(Settings.ACTION_SETTINGS);i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);getContext().startActivity(i);call.resolve();}',
  '}'
 ].join('\n'));
 fs.writeFileSync(path.join(javaDir,'MainActivity.java'),[
  'package com.lariosrental.management;',
  'import android.os.Bundle;',
  'import com.getcapacitor.BridgeActivity;',
  'public class MainActivity extends BridgeActivity {',
  ' @Override public void onCreate(Bundle savedInstanceState){super.onCreate(savedInstanceState);registerPlugin(LariosKioskPlugin.class);}',
  ' @Override public void onResume(){super.onResume();LariosKioskController.enter(this);}',
  '}'
 ].join('\n'));
}
