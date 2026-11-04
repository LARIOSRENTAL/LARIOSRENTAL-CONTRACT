const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=n=>fs.readFileSync(path.join(__dirname,'../app-v84/www',n),'utf8');
(async()=>{
 const dom=new JSDOM('<body><div id="reservation"><canvas id="signatureCanvas" width="800" height="220"></canvas></div></body>',{url:'https://test.invalid',runScripts:'outside-only'});
 const w=dom.window;let reads=0;w.HTMLCanvasElement.prototype.getContext=()=>({getImageData(){reads++;return{data:new Uint8ClampedArray(800*220*4)}}});
 w.LariosCurrentContractId='contract-a';w.eval(source('signature-persistence-v1.js'));
 for(let i=0;i<50;i++){w.document.body.appendChild(w.document.createElement('span'));await Promise.resolve()}
 assert.equal(reads,0,'unrelated mutations must not scan a blank signature bitmap');
 w.sessionStorage.setItem('lr_signature_contract-b','data:image/png;base64,test');w.LariosCurrentContractId='contract-b';
 w.document.body.appendChild(w.document.createElement('span'));await new Promise(r=>setTimeout(r,0));assert.equal(reads,1,'a new contract restores its saved signature once');await new Promise(r=>setTimeout(r,0));
 const s=source('larios-fixes.js');const start=s.indexOf('records=>{if(');const end=s.indexOf('});if',start);const callback=s.slice(start,end+1);
 let calls=0;const section={classList:{contains:()=>false}};
 const handler=vm.runInNewContext('('+callback+')',{$:()=>section,patchForm:()=>calls++});
 handler([{type:'attributes',target:{},addedNodes:[]}]);assert.equal(calls,0,'child class changes must not restart form pricing');
 handler([{type:'attributes',target:section,addedNodes:[]}]);assert.equal(calls,1,'opening the editor still initializes controls');
 const drawSource=source('larios-fixes.js').split('\n').find(line=>line.startsWith('function setupDraw('));
 const points=[];const canvas={style:{},width:100,height:100,setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),getContext:()=>({beginPath(){},moveTo(){},lineTo(x,y){points.push([x,y])},stroke(){}})};
 vm.runInNewContext(drawSource+';setupDraw(canvas,"black")',{canvas});
 canvas.onpointerdown({pointerId:1,clientX:0,clientY:0,preventDefault(){}});
 canvas.onpointermove({preventDefault(){},getCoalescedEvents:()=>[{clientX:10,clientY:20},{clientX:20,clientY:5},{clientX:30,clientY:25}]});
 assert.equal(points.length,3,'all curved intermediate points must be drawn, rather than one straight segment');
 console.log('UI responsiveness: signature restore and observer feedback checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
