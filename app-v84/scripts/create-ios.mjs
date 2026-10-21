import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}
if(!fs.existsSync('ios')){
 fs.mkdirSync('ios');
 // Configure the deployment target before the first CocoaPods install.
 run('tar',['--no-same-owner','-xzf','node_modules/@capacitor/cli/assets/ios-pods-template.tar.gz','-C','ios']);
}
if(!fs.existsSync('ios/App/Podfile'))throw Error('This iOS build requires the CocoaPods project because ML Kit does not support SPM.');
run('python3',['scripts/prepare-ios.py']);
run('npx',['cap','sync','ios']);
