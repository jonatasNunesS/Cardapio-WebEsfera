# ADR 0003: Domínios e ambientes

- Situação: aceita (M00), revista no M04 (API no host de cada app); o domínio comercial ainda está em aberto
- Data: 2026-10-21

## Contexto

O produto tem quatro superfícies públicas: o cardápio do cliente, o painel do
restaurante, o admin da plataforma e a API. O admin é o alvo mais valioso e
não pode dividir sessão com o resto (seção 2 do plano). O nome comercial e o
domínio ainda não foram decididos (seção 12).

## Decisão

Subdomínios do mesmo domínio registrável:

| Superfície            | Host                                     | Variável           |
| --------------------- | ---------------------------------------- | ------------------ |
| Cardápio do cliente   | `cardapio.<dominio>`                     | `DOMINIO_CARDAPIO` |
| Painel do restaurante | `painel.<dominio>`                       | `DOMINIO_PAINEL`   |
| Admin da plataforma   | `admin.<dominio>`                        | `DOMINIO_ADMIN`    |
| API                   | `/api` no host de cada app (desde o M04) | —                  |

Ambientes, pela variável `APP_ENV`: `local`, `preview`, `homologacao` e
`producao`. Cada um tem o próprio conjunto de domínios e segredos.

### API no host de cada app (M04)

Decisão do John em 2026-10-22, entre as opções do M00: cada app chama `/api`
no próprio host, e um proxy reverso encaminha para a API.

- `painel.<dominio>/api/...` e `admin.<dominio>/api/...` chegam ao mesmo
  processo da API, que confere o host de cada grupo de rotas: as rotas do
  painel só respondem em `DOMINIO_PAINEL` e as do admin só em
  `DOMINIO_ADMIN`; nos outros hosts são 404.
- O proxy precisa repassar o `Host` original (ou `X-Forwarded-Host`) e o
  `X-Forwarded-For`. A API só confia nesses cabeçalhos vindos dos endereços em
  `PROXIES_CONFIAVEIS`.
- Em local, o servidor do Vite faz o papel do proxy (`server.proxy` com
  `changeOrigin: false`, para manter o `Host`): o painel abre em
  `http://painel.localhost:5173` e o admin em `http://admin.localhost:5174`.
  O Chromium resolve `*.localhost` para o próprio computador e trata esses
  hosts como contexto seguro, então os cookies `Secure` funcionam sem HTTPS.
  https://vite.dev/config/server-options#server-proxy
- O cardápio do cliente segue a mesma regra quando chegar a hora (M06).

### Cookies

- Todos com prefixo `__Host-`: `Secure`, `Path=/` e sem `Domain`. Cada cookie
  vale só no host que o emitiu, e nenhum subdomínio lê nem sobrescreve o de
  outro. Detalhes e nomes no ADR 0008.
- Sessão do painel em `painel.<dominio>`, sessão do admin em
  `admin.<dominio>`, ambas `HttpOnly` e `SameSite=Lax`.
- Nenhum cookie de sessão usa `Domain=.<dominio>`.

### CORS

- Não há CORS com credenciais: as chamadas são da mesma origem (app e `/api`
  no mesmo host). A API não registra `@fastify/cors`; o navegador bloqueia
  qualquer leitura de outra origem.
- A proteção de CSRF continua obrigatória nas rotas de escrita (ADR 0008),
  porque `SameSite=Lax` não protege contra um subdomínio comprometido do mesmo
  site.

## Consequências

- `DOMINIO_API` saiu do `.env.exemplo` no M04. A API usa `DOMINIO_PAINEL`,
  `DOMINIO_ADMIN` e `PROXIES_CONFIAVEIS`.
- Impacto no deploy (M17): o proxy reverso de cada host precisa encaminhar
  `/api/` para a API, repassar `Host` e `X-Forwarded-For` e servir o resto
  como arquivos estáticos do app. O endereço do proxy entra em
  `PROXIES_CONFIAVEIS`. A API não precisa de domínio público próprio.
- O domínio comercial vai impresso em todo QR de mesa. Precisa estar decidido
  antes de imprimir o primeiro QR do piloto.
