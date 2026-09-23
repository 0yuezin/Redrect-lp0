const MAX_HTML_BYTES = 512 * 1024;
const ADMIN_USER = "admin";
const AUTH_SECRET = "nevoa-redirect-0yue-session-secret-2026";
const MAX_PATH = 300;
const MAX_FILENAME = 120;
const KEY = "routes";
const COOKIE = "NEVOA_REDIRECT_SESSION";

function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"Content-Type":"application/json; charset=utf-8", ...extra}
  });
}
function text(data,status=200,headers={}) {
  return new Response(data,{status,headers});
}
function cleanPath(path) {
  if (typeof path !== "string") throw new Error("Caminho inválido.");
  let p = path.trim();
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/+/g,"/");
  if (p.length > 1) p = p.replace(/\/+$/,"");
  if (p.length > MAX_PATH || p.includes("..") || !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(p)) {
    throw new Error("Caminho inválido.");
  }
  return p;
}
function validDestination(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch { return false; }
}
function validFilename(name) {
  return typeof name === "string" && name.length <= MAX_FILENAME &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*\.html?$/i.test(name);
}
function getKV(env) {
  const kv = env?.NEVOA_REDIRECT_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    throw new Error("NEVOA_REDIRECT_KV não está disponível nesta Pages Function/deployment. Verifique o KV binding e faça um novo deploy.");
  }
  return kv;
}
async function getRoutes(env) {
  const kv = getKV(env);
  return (await kv.get(KEY,"json")) || [];
}
async function putRoutes(env,routes) {
  const kv = getKV(env);
  await kv.put(KEY,JSON.stringify(routes));
}
function cookieValue(request) {
  const raw=request.headers.get("Cookie")||"";
  const m=raw.match(new RegExp("(?:^|;\\s*)"+COOKIE+"=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
async function secretBytes(secret){return new TextEncoder().encode(secret);}
function b64u(bytes) {
  let s="";
  for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64u(s) {
  s=s.replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
async function hmac(secret,data) {
  const key=await crypto.subtle.importKey("raw",await secretBytes(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(data)));
}
async function makeSession(env) {
  const payload=b64u(new TextEncoder().encode(JSON.stringify({u:ADMIN_USER,exp:Date.now()+1000*60*60*12})));
  return payload+"."+b64u(await hmac(AUTH_SECRET,payload));
}
async function isAuthenticated(request,env) {
  const c=cookieValue(request); if(!c || !AUTH_SECRET)return false;
  const [payload,sig]=c.split("."); if(!payload||!sig)return false;
  try {
    const key=await crypto.subtle.importKey("raw",await secretBytes(AUTH_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    const ok=await crypto.subtle.verify("HMAC",key,fromB64u(sig),new TextEncoder().encode(payload));
    if(!ok)return false;
    const obj=JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    return obj.u===ADMIN_USER && obj.exp>Date.now();
  } catch { return false; }
}
function sameOrigin(request) {
  const origin=request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
async function requireAuth(context) {
  if(!(await isAuthenticated(context.request,context.env))) return json({erro:"Não autenticado."},401);
  if(!sameOrigin(context.request)) return json({erro:"Origem inválida."},403);
  return null;
}

export async function onRequestGet(context) {
  const auth=await requireAuth(context); if(auth)return auth;
  return json(await getRoutes(context.env));
}
export async function onRequestPost(context) {
  const auth=await requireAuth(context); if(auth)return auth;
  let body; try{body=await context.request.json();}catch{return json({erro:"JSON inválido."},400);}
  try {
    const path=cleanPath(body.path);
    const type=body.type;
    if(type!=="redirect" && type!=="html") throw new Error("Tipo inválido.");
    const routes=await getRoutes(context.env);
    const duplicate=routes.find(r=>r.path===path && r.id!==body.id);
    if(duplicate)return json({erro:"Essa rota já existe."},409);

    let item;
    if(body.id){
      const old=routes.find(r=>r.id===body.id); if(!old)return json({erro:"Rota não encontrada."},404);
      item={...old,path,type,updatedAt:new Date().toISOString()};
    } else {
      item={id:crypto.randomUUID(),path,type,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    }
    if(type==="redirect"){
      if(!validDestination(body.destination))return json({erro:"URL de destino inválida."},400);
      item.destination=body.destination;
      delete item.html; delete item.filename;
    } else {
      if(body.html!==undefined){
        if(typeof body.html!=="string")return json({erro:"HTML inválido."},400);
        const bytes=new TextEncoder().encode(body.html).byteLength;
        if(bytes>MAX_HTML_BYTES)return json({erro:"HTML excede 512 KB."},400);
        if(!validFilename(body.filename||""))return json({erro:"Nome de arquivo inválido."},400);
        item.html=body.html; item.filename=body.filename;
      } else if(!item.html) {
        return json({erro:"É necessário enviar um arquivo HTML."},400);
      }
      delete item.destination;
    }
    const idx=routes.findIndex(r=>r.id===item.id);
    if(idx>=0)routes[idx]=item; else routes.push(item);
    await putRoutes(context.env,routes);
    return json(item,200);
  }catch(e){return json({erro:e.message||"Dados inválidos."},400);}
}
export async function onRequestDelete(context) {
  const auth=await requireAuth(context); if(auth)return auth;
  let body; try{body=await context.request.json();}catch{return json({erro:"JSON inválido."},400);}
  if(!body.id)return json({erro:"ID obrigatório."},400);
  const routes=await getRoutes(context.env);
  const next=routes.filter(r=>r.id!==body.id);
  if(next.length===routes.length)return json({erro:"Rota não encontrada."},404);
  await putRoutes(context.env,next);
  return json({ok:true});
}
