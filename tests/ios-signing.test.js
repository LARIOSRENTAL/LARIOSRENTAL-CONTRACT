const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lr-ios-signing-'));
try{
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'build'));fs.mkdirSync(path.join(root,'ios/App/App.xcodeproj'),{recursive:true});
 fs.copyFileSync(require.resolve('../app-v84/scripts/configure-ios-signing.py'),path.join(root,'scripts/configure-ios-signing.py'));fs.writeFileSync(path.join(root,'capacitor.config.json'),JSON.stringify({appId:'com.lariosrental.management'}));
 const setup=spawnSync('python3',['-c',`import plistlib,datetime
from pathlib import Path
p={'Name':'Test profile','ExpirationDate':datetime.datetime.utcnow()+datetime.timedelta(days=30),'ProvisionedDevices':['registered-test-device'],'Entitlements':{'application-identifier':'TEAM123.com.lariosrental.management','com.apple.developer.proximity-reader.payment.acceptance':True,'get-task-allow':False}}
Path('build/base.plist').write_bytes(plistlib.dumps(p))`],{cwd:root,encoding:'utf8'});assert.equal(setup.status,0,setup.stderr);
 function run(patch='',method='release-testing'){
  fs.writeFileSync(path.join(root,'ios/App/App.xcodeproj/project.pbxproj'),'CODE_SIGN_STYLE = Automatic;\nINFOPLIST_FILE = App/Info.plist;\n');
  const r=spawnSync('python3',['-c',`import plistlib,datetime
from pathlib import Path
p=plistlib.loads(Path('build/base.plist').read_bytes())
${patch}
Path('build/profile.plist').write_bytes(plistlib.dumps(p))`],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  return spawnSync('python3',['scripts/configure-ios-signing.py'],{cwd:root,encoding:'utf8',env:{...process.env,LR_IOS_PROFILE_PLIST:'build/profile.plist',LR_IOS_TEAM_ID:'TEAM123',LR_IOS_CERTIFICATE_SHA1:'A'.repeat(40),LR_IOS_EXPORT_METHOD:method}});
 }
 assert.equal(run().status,0);
 for(const patch of ["p['Entitlements'].pop('com.apple.developer.proximity-reader.payment.acceptance')","p['Entitlements']['application-identifier']='OTHER.com.lariosrental.management'","p['ExpirationDate']=datetime.datetime(2020,1,1)","p['Entitlements']['get-task-allow']=True","p.pop('ProvisionedDevices')"]){assert.notEqual(run(patch).status,0,'Reject profile: '+patch)}
 assert.notEqual(run('', 'debugging').status,0);assert.equal(run("p['Entitlements']['get-task-allow']=True",'debugging').status,0);assert.notEqual(run('', 'app-store-connect').status,0);assert.equal(run("p.pop('ProvisionedDevices')",'app-store-connect').status,0);
 console.log('Apple signing: rejects missing Tap to Pay grant, wrong bundle/team, expiry and mismatched distribution profiles: ok');
}finally{fs.rmSync(root,{recursive:true,force:true})}
