# ADR 0015: Pedido do cliente

- Situação: proposta (M11)
- Data: 2026-10-30

## Contexto

O M11 deixa o cliente montar o carrinho, enviar o pedido e acompanhar o status
pela sessão de mesa. O pedido é gravado na hora, sem fila, com idempotência e
numeração por restaurante. As regras do prompt
(`docs/prompts/m11-pedido-do-cliente.md`) valem como requisito.

Decisões do John antes de codar (2026-10-30):

1. `contadores_pedido`, `pedidos` e `itens_pedido` nascem numa migração do M11
   (o prompt dizia que existiam desde o M02; não existiam).
2. Carrinho e status num chunk carregado sob demanda.
3. Ciclo da chave: nasce no primeiro item, muda a cada alteração, é descartada
   depois de uma resposta definitiva; só falha de rede ou 5xx mantém a mesma
   chave. A mesma chave com outro carrinho dá 422 `PEDIDO_CRIAR_CHAVE_REUSADA`.
4. Sem horário cadastrado conta como aberto.
5. Orçamento de JavaScript (decidido depois da primeira medição): o chunk do
   carrinho é aquecido no primeiro "Adicionar ao pedido", e o Sentry baixa na
   primeira interação ou com a página ociosa. Os 170 KB valem para a primeira
   carga, não para o Sentry.

## Decisões

### Banco

Migração `0014_pedidos.sql`, pelo padrão do ADR 0006 (RLS forçado, política
`FOR ALL TO app_runtime`, fábricas e testes 1 a 8):

- `contadores_pedido (restaurante_id PK, ultimo_numero)`: o número sai de
  `INSERT ... ON CONFLICT (restaurante_id) DO UPDATE SET ultimo_numero =
ultimo_numero + 1 RETURNING`. A trava de linha serializa os pedidos do mesmo
  restaurante; como é tabela e não sequência, um rollback devolve o número e
  não há salto.
- `pedidos`: únicos `(restaurante_id, chave_idempotencia)` e
  `(restaurante_id, numero)`; guardam `sessao_mesa_id`, `mesa_id` e o
  `hash_conteudo` (SHA-256 do carrinho canônico). O `app_runtime` só altera
  `situacao` e `atualizado_em`.
- `itens_pedido`: só `SELECT` e `INSERT`. Nome e preço do momento: mudar o
  cardápio não altera um pedido gravado.
- Máquina de estados também no banco: um gatilho recusa transição fora de
  `enviado -> em_preparo -> pronto -> entregue`, com cancelamento antes de
  entregue.

### CriarPedido: uma transação curta, nada de fila

Dentro de `comRestaurante()`:

1. A sessão de mesa precisa estar aberta e não vencida; senão, 401 com o
   caminho de escanear de novo.
2. `pg_advisory_xact_lock` pela chave: duas requisições simultâneas com a
   mesma chave esperam uma pela outra, e a segunda acha o pedido da primeira.
3. Chave já usada: mesmo hash devolve o mesmo pedido (200, mesma resposta);
   hash diferente é 422. O reenvio vale mesmo se o prato esgotou depois, porque
   o pedido já existe.
4. A decisão é uma função pura da aplicação: restaurante inadimplente ou
   cancelado recusa (403), fechado recusa (409), item esgotado ou removido
   recusa com os ids (409). Preço e total vêm do cardápio atual; o corpo só
   aceita `pratoId`, quantidade e observação (`strictObject`).
5. Número, `pedidos`, `itens_pedido` e `PedidoCriado` na outbox, juntos. Há
   teste que derruba a transação no fim e confere que nada sobra, nem o número.

`CancelarPedido` trava a linha, aceita só `enviado` e grava `PedidoCancelado`.
Depois disso, só a equipe (M13).

### O restaurante vem do cookie assinado (muda o ADR 0012)

O cookie `__Host-sessao_mesa` passa de `sessaoId` assinado para
`restauranteId:sessaoId` assinado (HMAC-SHA256, `CHAVE_SESSAO_MESA`). Sem o
restaurante no cookie, ler a sessão antes de ter o contexto exigiria uma função
privilegiada nova. O HMAC impede trocar o restaurante; a transação ainda
confere, com RLS, que a sessão existe naquele restaurante. Um cookie no
formato antigo vale como sessão encerrada.

Rotas no host do cardápio, sem CSRF próprio: o cookie é `SameSite=Lax` e a
criação exige o cabeçalho `Idempotency-Key`, que força a pré-checagem de CORS
em qualquer origem estranha.

| Rota                                         | O que faz                                                           |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `POST /api/v1/mesa/pedidos`                  | cria; `Idempotency-Key` uuid v7 obrigatória; 201 novo, 200 repetido |
| `GET /api/v1/mesa/pedidos/:id`               | status, só da própria sessão                                        |
| `POST /api/v1/mesa/pedidos/:id/cancelamento` | cancela enquanto `enviado`                                          |

### Cliente

- Carrinho em `sessionStorage` por mesa, num store pequeno com
  `useSyncExternalStore`. Chave uuid v7 da RFC 9562 gerada por uma função de
  15 linhas (`gerarUuidV7` nos contratos sem zod), sem biblioteca.
- Envio: o botão vira "Enviando..." e fica desativado na hora (estado
  otimista sem prometer o resultado). Falha de rede ou 5xx mostra "Sem
  conexão", guarda o carrinho e o botão "Tentar de novo" reenvia com a mesma
  chave. O e2e perde a resposta de propósito depois de o servidor gravar e
  confere que o reenvio leva a mesma chave e devolve o pedido 1; o seguinte é
  o 2.
- Status por consulta a cada 15 s (o tempo real é do M13).
- Escolhemos `fetch` com estado local em vez de `action`/`useFetcher` do React
  Router: o envio não navega até ter o pedido, e a chave precisa sobreviver a
  recarregar a página, o que o store já resolve.

### Orçamento de JavaScript

| Medida (Lighthouse, 4G simulado, 3 execuções) | JS transferido                | LCP                      |
| --------------------------------------------- | ----------------------------- | ------------------------ |
| Antes do M11                                  | ~167 KB                       | mediana 2,27 s           |
| M11 com o chunk aquecido depois do cardápio   | 114.709 / 172.114 / 117.456 B | 2.517 / 1.912 / 1.838 ms |
| M11 final                                     | 114.861 / 114.861 / 114.861 B | 1.802 / 2.363 / 1.891 ms |

- O bundle inicial cresceu 2 KB comprimidos (botão "Adicionar", barra do
  pedido, store e gerador de uuid). Carrinho e status ficam num chunk de
  ~2,7 KB, carregado na rota e aquecido no primeiro "Adicionar ao pedido",
  quando o cliente está online, para o carrinho abrir sem conexão depois.
- O SDK do Sentry (~54 KB) baixa na primeira interação (toque, clique ou
  tecla; rolar não conta) ou depois de 10 s sem interação, seguidos de
  `requestIdleCallback`, o que vier primeiro. "Ociosa" não é o
  `requestIdleCallback` puro: ele dispara milissegundos depois da carga, ainda
  dentro da medição.
- **Custo:** erros e métricas dos primeiros segundos esperam na fila (o mesmo
  mecanismo do ADR 0013) até o SDK chegar. Se o cliente fechar a página antes
  da primeira interação e dos 10 s, esses erros se perdem. O LCP e o INP
  continuam medidos, porque os observadores são `buffered`.

## Consequências

- Rede ruim não duplica pedido: a chave e o hash garantem um pedido por
  carrinho enviado.
- A numeração é sequencial por restaurante, sem salto: teste de carga com 50
  restaurantes e 8 pedidos simultâneos cada.
- Um carrinho aberto nunca antes do primeiro "Adicionar" não abre offline;
  como só existe carrinho depois de adicionar, isso não acontece na prática.
- Folga do JS da primeira carga: ~55 KB.

## Fontes consultadas

- RFC 9562, UUID v7: https://www.rfc-editor.org/rfc/rfc9562#name-uuid-version-7
- React Router, rotas com `lazy`: https://github.com/remix-run/react-router/blob/main/docs/start/data/route-object.md
- React Router, UI pendente e otimista: https://github.com/remix-run/react-router/blob/main/docs/start/framework/pending-ui.md
- React, `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- MDN, `requestIdleCallback`: https://github.com/mdn/content/blob/main/files/en-us/web/api/window/requestidlecallback/index.md
- PostgreSQL, travas consultivas: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- PostgreSQL, `INSERT ... ON CONFLICT`: https://www.postgresql.org/docs/current/sql-insert.html
- Playwright, `route.fetch`: https://playwright.dev/docs/api/class-route#route-fetch
