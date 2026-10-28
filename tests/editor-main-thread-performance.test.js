const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','app-v84','www');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');

const uppercase=source('uppercase-fields-v1.js');
assert.match(uppercase,/LariosTypingPerformance=\{active:typingActive/,'typing activity must be exposed to editor modules');
assert.match(uppercase,/new MutationObserver\(scheduleScan\)/,'uppercase field discovery must be coalesced');
assert.doesNotMatch(uppercase,/new MutationObserver\(\(\)=>scan\(\)\)/,'full-form scans must not run for every DOM mutation');

const pricing=source('pricing-autocalc-v2.js');
assert.match(pricing,/function editorBusy\(\)/,'pricing must detect active text editing');
assert.match(pricing,/if\(editorBusy\(\)\|\|formTimer\)return/,'pricing DOM mutations must be coalesced and paused during typing');
assert.doesNotMatch(pricing,/new MutationObserver\(\(\)=>setTimeout\(\(\)=>\{bind\(\);recalcReady\(false\)\},20\)\)/,'pricing must not schedule one full recalculation per mutation');

for(const [name,pattern] of [
  ['payment-methods-v1.js',/LariosTypingPerformance\?\.active/],
  ['workflow-improvements-v1.js',/LariosTypingPerformance\?\.active/],
  ['fuel-default-v1.js',/LariosTypingPerformance\?\.active/],
  ['card-persistence-safe-v1.js',/LariosTypingPerformance\?\.active/],
  ['contract-lifecycle-v6.js',/LariosTypingPerformance\?\.active/]
])assert.match(source(name),pattern,name+' must stay idle while text is selected or edited');

console.log('editor main-thread quiet mode: ok');
