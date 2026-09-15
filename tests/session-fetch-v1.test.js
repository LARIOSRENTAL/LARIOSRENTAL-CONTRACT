const assert=require('node:assert/strict');

global.window=global;
global.location={href:'https://lariosrental.github.io/',origin:'https://lariosrental.github.io'};
global.cfg={supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'publishable-key'};
global.token='expired-token';
global.LARIOS_TEST_ENV=false;

let calls=[];
let firstStatus=401;
global.fetch=async(_input,init={})=>{
  calls.push(init);
  return {status:calls.length===1?firstStatus:200};
};
let refreshCalls=0;
global.refreshSession=async()=>{
  refreshCalls+=1;
  global.token='fresh-token';
  return true;
};

require('../app-v84/www/session-fetch-v1.js');

(async()=>{
  const response=await global.fetch('https://project.supabase.co/rest/v1/rpc/app_save_contract',{
    method:'POST',
    headers:{Authorization:'Bearer expired-token','Content-Type':'application/json'},
    body:'{"p_payload":{}}'
  });
  assert.equal(response.status,200);
  assert.equal(refreshCalls,1);
  assert.equal(calls.length,2);
  assert.equal(new Headers(calls[1].headers).get('authorization'),'Bearer fresh-token');
  assert.equal(new Headers(calls[1].headers).get('apikey'),'publishable-key');
  assert.equal(calls[1].body,'{"p_payload":{}}');

  calls=[];
  firstStatus=403;
  const user=await global.fetch('https://project.supabase.co/auth/v1/user',{headers:{Authorization:'Bearer expired-token'}});
  assert.equal(user.status,200);
  assert.equal(refreshCalls,2,'an expired auth user lookup must refresh after its 403 response');

  calls=[];
  firstStatus=401;
  const external=await global.fetch('https://example.invalid/resource');
  assert.equal(external.status,401);
  assert.equal(refreshCalls,2,'external requests must never refresh the Supabase session');

  assert.equal(global.LariosSessionFetch.version,'session-retry1-20260915');
  console.log('session-fetch-v1 tests passed');
})().catch(error=>{console.error(error);process.exit(1)});
