export async function onRequestGet(context) {
  const {request, env} = context;
  const url = new URL(request.url);
  const path = decodeURIComponent(url.pathname).replace(/\/+$/,"") || "/";
  if (path === "/" || path === "/admin") {
    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), {method:"GET", headers:request.headers}));
  }
  const kv = env?.NEVOA_REDIRECT_KV;
  if (!kv || typeof kv.get !== "function") {
    return new Response("NEVOA_REDIRECT_KV não está disponível nesta Pages Function/deployment. Verifique o KV binding e faça um novo deploy.", {
      status: 500,
      headers: {"Content-Type":"text/plain; charset=utf-8"}
    });
  }
  const routes = (await kv.get("routes","json")) || [];
  const route = routes.find(r => r.path === path);
  if (route) {
    if (route.type === "redirect") {
      return Response.redirect(route.destination, 302);
    }
    if (route.type === "html") {
      return new Response(route.html || "<h1>HTML vazio</h1>", {
        status: 200,
        headers: {
          "Content-Type":"text/html; charset=utf-8",
          "Cache-Control":"public, max-age=60",
          "Content-Security-Policy":"default-src 'self' https: data:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-forms allow-popups allow-popups-to-escape-sandbox",
          "X-Content-Type-Options":"nosniff",
          "Referrer-Policy":"no-referrer"
        }
      });
    }
  }
  return env.ASSETS.fetch(new Request(new URL("/index.html",request.url),{method:"GET",headers:request.headers})).then(async r=>{
    // Let the SPA render its branded 404 for an unknown path.
    return r;
  });
}
