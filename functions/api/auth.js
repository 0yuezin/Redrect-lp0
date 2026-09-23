const COOKIE = "NEVOA_REDIRECT_SESSION";
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "isabelly";
const AUTH_SECRET = "nevoa-redirect-0yue-session-secret-2026";
function fromB64u(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8",...headers}});}
function b64u(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
async function hmac(secret,data){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(data)));
}
async function session(env){
 const payload=b64u(new TextEncoder().encode(JSON.stringify({u:ADMIN_USER,exp:Date.now()+1000*60*60*12})));
 return payload+"."+b64u(await hmac(AUTH_SECRET,payload));
}
async function valid(request,env){
 const raw=request.headers.get("Cookie")||""; const m=raw.match(/(?:^|;\s*)NEVOA_REDIRECT_SESSION=([^;]+)/);
 if(!m)return false;
 const [p,s]=(m[1]||"").split("."); if(!p||!s)return false;
 try{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(AUTH_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!(await crypto.subtle.verify("HMAC",key,fromB64u(s),new TextEncoder().encode(p))))return false;
  const b=p.replace(/-/g,"+").replace(/_/g,"/"); const obj=JSON.parse(new TextDecoder().decode(fromB64u(b)));
  return obj.u===ADMIN_USER&&obj.exp>Date.now();
 }catch{return false;}
}
export async function onRequestGet({request,env}){return json({authenticated:await valid(request,env)});}
export async function onRequestPost({request,env}){
 if(request.headers.get("Origin") && request.headers.get("Origin")!==new URL(request.url).origin)return json({erro:"Origem inválida."},403);
 let b;try{b=await request.json()}catch{return json({erro:"JSON inválido."},400);}
 if(b.username!==ADMIN_USER||b.password!==ADMIN_PASSWORD)return json({erro:"Usuário ou senha incorretos."},401);
 const token=await session(env);
 return json({authenticated:true},200,{"Set-Cookie":`${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`,"Cache-Control":"no-store"});
}
export async function onRequestDelete({request}){
 const origin=request.headers.get("Origin");
 if(origin&&origin!==new URL(request.url).origin)return json({erro:"Origem inválida."},403);
 return json({ok:true},200,{"Set-Cookie":`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,"Cache-Control":"no-store"});
}
