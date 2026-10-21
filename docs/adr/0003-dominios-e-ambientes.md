# ADR 0003: Domínios e ambientes

- Situação: aceita (M00); o domínio comercial ainda está em aberto
- Data: 2026-10-21

## Contexto

O produto tem quatro superfícies públicas: o cardápio do cliente, o painel do
restaurante, o admin da plataforma e a API. O admin é o alvo mais valioso e
não pode dividir sessão com o resto (seção 2 do plano). O nome comercial e o
domínio ainda não foram decididos (seção 12).

## Decisão

Subdomínios do mesmo domínio registrável:

| Superfície            | Host                 | Variável           |
| --------------------- | -------------------- | ------------------ |
| Cardápio do cliente   | `cardapio.<dominio>` | `DOMINIO_CARDAPIO` |
| Painel do restaurante | `painel.<dominio>`   | `DOMINIO_PAINEL`   |
| Admin da plataforma   | `admin.<dominio>`    | `DOMINIO_ADMIN`    |
| API                   | `api.<dominio>`      | `DOMINIO_API`      |

Ambientes, pela variável `APP_ENV`: `local`, `preview`, `homologacao` e
`producao`. Cada um tem o próprio conjunto de domínios e segredos.

### Cookies

- Sessão do painel e sessão de mesa: cookie `HttpOnly`, `Secure`,
  `SameSite=Lax`, emitido pela API. Como `painel.` e `api.` são do mesmo site
  (mesmo domínio registrável), o `SameSite=Lax` funciona nas chamadas do
  painel para a API.
- Admin: cookie só do host (prefixo `__Host-`, sem atributo `Domain`, com
  `Path=/` e `Secure`). Assim nenhum outro subdomínio lê nem sobrescreve a
  sessão do admin. Detalhe a confirmar no M04: o cookie do admin precisa ser
  emitido para o host que o navegador usa nas chamadas do admin, ou por
  `admin.<dominio>` com a API atrás do mesmo host, ou por um host de API
  dedicado ao admin.
- Nenhum cookie de sessão usa `Domain=.<dominio>`.

### CORS

- A API só aceita origens da lista explícita formada pelas variáveis
  `DOMINIO_*` do ambiente, nunca `*` nem reflexo do cabeçalho `Origin`.
- `credentials: true` só para as origens do painel e do admin. O cardápio
  manda o cookie de mesa da mesma forma.
- Como os subdomínios são do mesmo site, `SameSite` não protege contra um
  subdomínio comprometido. A proteção de CSRF nas rotas de escrita (seção 5)
  continua obrigatória.

## Consequências

- No M00 isso só existe como variáveis em `.env.exemplo`. A configuração de
  CORS e cookies entra no M04.
- O domínio comercial vai impresso em todo QR de mesa. Precisa estar decidido
  antes de imprimir o primeiro QR do piloto.
