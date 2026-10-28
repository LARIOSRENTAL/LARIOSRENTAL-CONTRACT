const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const web=path.join(__dirname,'..','app-v84','www');
const runtime=fs.readFileSync(path.join(web,'runtime-hotfix.js'),'utf8');
const lifecycle=fs.readFileSync(path.join(web,'contract-lifecycle-v6.js'),'utf8');
const legacy=fs.readFileSync(path.join(web,'larios-fixes.js'),'utf8');

assert.match(runtime,/if\(affectsPricing\(event\.target\)\)setTimeout\(recalc,0\)/,
  'runtime recalculation must be restricted to pricing inputs');
assert.match(lifecycle,/if\(!relevant\)return;/,
  'lifecycle totals must ignore ordinary customer text input');
assert.doesNotMatch(legacy,/setInterval\(\(\)=>\{if\(!\$\('reservation'\)\?\.classList\.contains\('hidden'\)\)patchForm\(\)\},800\)/,
  'the legacy form patcher must not rebuild and recalculate the open editor every 800ms');

console.log('contract input performance guards: ok');
