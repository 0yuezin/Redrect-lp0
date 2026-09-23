# Névoa Redirect

Projeto separado para `0yue.nevoa.dpdns.org`, inspirado no projeto Névoa existente.

## O que foi reaproveitado

- `logo.png` do projeto enviado.
- Linguagem visual do projeto existente: fundo escuro, cards, bordas discretas, ciano, tipografia de destaque, botões arredondados.
- Conceito de Cloudflare Pages Functions + KV.
- Página 404 adaptada ao visual da página de erro existente.

## Arquitetura

```text
/
├── index.html
├── logo.png
├── _redirects
└── functions/
    ├── [[path]].js          # resolve /youtube, /musicas/minezin, 404 e /admin
    └── api/
        ├── auth.js          # login/sessão HttpOnly
        └── routes.js        # CRUD protegido das rotas
```

### KV

Crie um namespace KV no Cloudflare e faça o binding:

`NEVOA_REDIRECT_KV`

A chave usada é:

`routes`

O valor é um array JSON de objetos:

```json
{
  "id": "uuid",
  "path": "/youtube",
  "type": "redirect",
  "destination": "https://youtube.com/@0yue",
  "createdAt": "...",
  "updatedAt": "..."
}
```

ou:

```json
{
  "id": "uuid",
  "path": "/musicas/minezin",
  "type": "html",
  "filename": "minezin.html",
  "html": "<!doctype html>...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

## Credenciais

Este pacote foi preparado conforme solicitado para usar:

- Usuário: `admin`
- Senha: `isabelly`

As credenciais estão no arquivo `functions/api/auth.js`.

**Atenção:** como estão no código, qualquer pessoa com acesso ao repositório poderá vê-las.

## Segurança

O projeto existente enviado contém a senha administrativa no JavaScript do navegador e também a valida diretamente na API. Para o projeto novo, essa parte foi deliberadamente melhorada:

- credenciais ficam no ambiente do Cloudflare;
- sessão é um cookie `HttpOnly`, `Secure`, `SameSite=Strict`;
- APIs administrativas exigem sessão;
- mutações verificam `Origin`;
- rotas duplicadas são recusadas;
- caminhos e URLs são validados;
- HTML é limitado a 512 KB;
- nomes de arquivos são validados;
- HTML publicado recebe CSP com `script-src 'none'` e `sandbox`, reduzindo o risco de uma página publicada acessar a sessão administrativa.

### Observação importante sobre HTML no mesmo domínio

Como as páginas HTML são servidas em caminhos do mesmo domínio, isolamento é importante. Por isso o servidor adiciona CSP/sandbox. Não remova essa política sem entender as consequências.

## Deploy

1. Crie um novo repositório separado no GitHub.
2. Envie estes arquivos.
3. Crie um Cloudflare Pages Project apontando para o novo repositório.
4. Não conecte esse projeto ao repositório/site principal da Névoa.
5. Crie o KV e faça o binding `NEVOA_REDIRECT_KV`.
6. Configure os três valores de ambiente.
7. Faça o deploy.
8. Em Custom domains, adicione `0yue.nevoa.dpdns.org`.

## Limitações intencionais

- HTML: 512 KB por página.
- O editor aceita `.html` e `.htm`.
- Redirects aceitam somente `http://` e `https://`.
- Não há armazenamento em `localStorage` para os dados administrativos.
- Não existe fallback local para rotas: se o KV não estiver configurado, o sistema não finge que os dados são públicos.

## Relação com o site principal

Este projeto é independente. Ele não altera o repositório `0yuezin/Nevoa`.
