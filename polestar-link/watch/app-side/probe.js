export async function probe(fetchFn, nonce) {
 if (!/^[a-zA-Z0-9_-]{1,64}$/.test(nonce)) return {ok:false,error:'Invalid test ID'};
 try {
  const response = await fetchFn({url:'http://127.0.0.1:29864/probe?nonce='+nonce,method:'GET'});
  const body=typeof response.body==='string'?JSON.parse(response.body):response.body;
  if(!body || body.ok!==true || body.nonce!==nonce || typeof body.locked!=='boolean') return {ok:false,error:'Unexpected bridge response'};
  return {ok:true,locked:body.locked,count:body.count};
 } catch(e) { return {ok:false,error:'Android bridge unreachable'}; }
}
