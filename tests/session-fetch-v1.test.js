const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const index=fs.readFileSync(require.resolve('../app-v84/www/index.html'),'utf8');
const core=index.slice(index.indexOf('async function refreshSession(){'),index.indexOf('function hdr(){'));
const wrapper=fs.readFileSync(require.resolve('../app-v84/www/session-fetch-v1.js'),'utf8');
const origin='https://project.supabase.co';
const saveUrl=origin+'/rest/v1/rpc/app_save_contract';
const userUrl=origin+'/auth/v1/user';
const jwt=(sub,offset)=>'header.'+Buffer.from(JSON.stringify({sub,exp:Math.floor(Date.now()/1000)+offset})).toString('base64url')+'.signature';

function setup(offset){
  const original=jwt('operator',offset),fresh=jwt('operator',3600);
  const calls=[],storage=new Map([['lr_token',original],['lr_refresh_token','refresh-1']]);
  const state={refresh:()=>Response.json({access_token:fresh,refresh_token:'refresh-2'}),request:()=>new Response(null,{status:200})};
  const login={hidden:true,classList:{add(){login.hidden=true},remove(){login.hidden=false}}};
  const context={
    URL,Request,Response,Headers,atob,navigator:{},location:{href:'https://lariosrental.github.io/'},
    cfg:{supabaseUrl:origin,supabasePublishableKey:'public-key'},token:original,
    localStorage:{getItem:key=>storage.get(key)??null},
    reservationSection:{classList:{contains:()=>false}},statusEl:{},loginErrorEl:{},loginSection:login,
    fetch:async(input,init)=>{
      const url=input instanceof Request?input.url:String(input);
      calls.push({url,init});
      return url.includes('grant_type=refresh_token')?state.refresh():state.request(input,init);
    },
    saveSession(data){
      context.token=data.access_token;
      storage.set('lr_token',data.access_token);
      storage.set('lr_refresh_token',data.refresh_token);
    },
    clearSession(){
      context.token=null;
      storage.delete('lr_token');
      storage.delete('lr_refresh_token');
    }
  };
  context.window=context;
  vm.runInNewContext(core+'\n'+wrapper,context);
  const send=url=>context.fetch(url,{method:'POST',headers:{Authorization:'Bearer '+context.token,'Content-Type':'application/json'},body:'{}'});
  return {context,original,fresh,state,storage,calls,login,send};
}

(async()=>{
  let t=setup(-30);
  await Promise.all([t.send(saveUrl),t.send(saveUrl)]);
  assert.equal(t.calls.length,3,'concurrent expired requests share one renewal');
  assert.match(t.calls[0].url,/refresh_token/);
  for(const {init} of t.calls.slice(1)){
    assert.equal(init.headers.get('authorization'),'Bearer '+t.fresh);
    assert.equal(init.headers.get('apikey'),'public-key');
    assert.equal(init.body,'{}');
  }

  t=setup(600);
  t.state.request=(_input,init)=>new Response(null,{status:init.headers.get('Authorization').endsWith(t.original)?403:200});
  assert.equal((await t.send(userUrl)).status,200);
  assert.equal(t.calls.length,3,'403 for the current user renews and retries once');

  t=setup(-30);
  t.state.refresh=()=>Response.json({error_code:'unexpected_failure'},{status:503});
  assert.match(await (await t.send(saveUrl)).text(),/unos segundos/);
  assert.equal(t.storage.get('lr_refresh_token'),'refresh-1');
  assert.equal(t.login.hidden,true);
  t.state.refresh=()=>Response.json({access_token:t.fresh,refresh_token:'refresh-2'});
  assert.equal((await t.send(saveUrl)).status,200);

  t=setup(-30);
  t.state.refresh=()=>Response.json({error_code:'refresh_token_not_found'},{status:400});
  assert.match(await (await t.send(saveUrl)).text(),/caducado/);
  assert.equal(t.login.hidden,false);
  assert.throws(()=>t.context.LariosSessionFetch.completeSignIn({user:{id:'other'}}),/misma cuenta/);
  assert.equal(t.context.token,null);
  assert.equal(t.context.LariosSessionFetch.completeSignIn({user:{id:'operator'},access_token:t.fresh,refresh_token:'refresh-2'}),true);
  assert.equal(t.login.hidden,true);
  assert.equal(t.calls.length,1,'signing in must not replay a contract automatically');
  assert.equal((await t.send(saveUrl)).status,200);

  t=setup(-30);
  t.storage.set('lr_token',t.fresh);
  t.storage.set('lr_refresh_token','refresh-2');
  await t.send(saveUrl);
  assert.equal(t.calls.length,1,'a newer session from another tab is reused');
  assert.equal(t.calls[0].init.headers.get('authorization'),'Bearer '+t.fresh);

  t=setup(-30);
  const invitation={method:'PUT',headers:{Authorization:'Bearer '+jwt('invitee',600)}};
  await t.context.fetch(userUrl,invitation);
  await t.send('https://example.invalid/resource');
  assert.equal(t.calls.length,2,'invitation credentials and external requests bypass renewal');
  assert.equal(t.calls[0].init,invitation);
  console.log('session-fetch-v1 tests passed');
})().catch(error=>{console.error(error);process.exit(1)});
