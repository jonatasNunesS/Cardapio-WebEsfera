# Demonstração do M09: cardápio do cliente

Pilha do e2e (API, worker, Postgres, Redis, Garage e o build de produção do
`cardapio` servido pelo `vite preview`), com restaurantes semeados pela API do
painel e um link de mesa real gerado pelo M08.

| Tela                                                               | Arquivo                  |
| ------------------------------------------------------------------ | ------------------------ |
| Abertura ("Você está na Mesa 12"), só no primeiro acesso da sessão | `01-abertura.png`        |
| Cardápio com destaque, esgotado e tema do restaurante              | `02-cardapio.png`        |
| Prato                                                              | `03-prato.png`           |
| Busca "abobora" achando "abóbora"                                  | `04-busca.png`           |
| Restaurante fechado: cardápio visível e o horário                  | `05-fechado.png`         |
| QR inválido, sem a marca do restaurante                            | `06-qr-invalido.png`     |
| Sessão expirada                                                    | `07-sessao-expirada.png` |
| Recarregado sem rede: cardápio do cache e o aviso                  | `08-offline.png`         |

Roteiro coberto pelos e2e (`scripts/e2e/cliente.e2e.ts` e
`scripts/e2e/cliente-midia.e2e.ts`): abrir o link, ver a abertura, ir ao
cardápio, abrir o prato, recarregar o prato (sem abertura de novo), buscar,
ficar offline e recarregar.

## Desempenho

Lighthouse CI, perfil móvel com 4G simulado, 3 execuções (`pnpm e2e:desempenho`):

| Execução | LCP    | FCP    | JavaScript transferido |
| -------- | ------ | ------ | ---------------------- |
| 1        | 1,62 s | 1,62 s | 112.655 bytes          |
| 2        | 1,82 s | 1,51 s | 167.299 bytes          |
| 3        | 2,43 s | 1,52 s | 112.655 bytes          |

As três ficaram dentro das metas (LCP até 2,5 s e JavaScript até 170.000 bytes);
a asserção usa a execução mediana. Nas execuções em que o SDK do Sentry termina de baixar dentro da janela do
Lighthouse, ele entra na conta (167 KB); ele só começa a baixar depois que o
cardápio aparece.

Build de produção do `cardapio` (`pnpm --filter @cardapio/cardapio build`):

| Arquivo                                  | Comprimido (gzip) |
| ---------------------------------------- | ----------------- |
| `index-*.js` (rota do cardápio)          | ~112 KB           |
| `sentry-web-*.js` (carregado depois)     | ~55 KB            |
| `sw.js` + `regras-*.js` (service worker) | ~1 KB             |
| `index-*.css`                            | ~4 KB             |
