# M05: demonstração de carga e de Redis parado

Data: 2026-10-22. Ambiente: `docker compose` local (Postgres 18.6 e Redis
8.8.3 com AOF), worker real (`apps/worker/src/principal.ts`) e um assinante
do pub/sub contando mensagens por id.

## 1. Ponta a ponta com o worker real

Roteiro: grava 500 eventos `SessaoMesaExpirada` de 50 restaurantes de uma vez
na `caixa_saida`; acompanha os pendentes a cada segundo; para o contêiner do
Redis (`docker compose stop redis`), grava mais 100 eventos, espera 5 s,
religa o Redis e acompanha de novo; no fim manda SIGTERM ao worker.

```text
== Preparação
== Carga: 500 eventos de 50 restaurantes gravados de uma vez
13:47:58 gravados; pendentes: 300
13:48:00 pendentes: 100
13:48:01 pendentes: 0
13:48:02 pendentes: 0
13:48:04 pendentes: 0
13:48:05 pendentes: 0
assinante: {"recebidas":500,"distintas":500}
== Redis parado
13:48:06 Redis parado
13:48:06 100 eventos gravados com o Redis fora; pendentes: 100
13:48:11 5 s depois, pendentes: 100
tentativas por evento pendente: 0
13:48:12 Redis de volta
13:48:13 pendentes: 0
assinante: {"recebidas":500,"distintas":500}
== Encerramento
worker saiu com código 0
eventos REDIS_CONEXAO_FALHOU reportados pelo worker: 3
```

Leitura:

- Carga: os 500 eventos saíram em cerca de 3 s, 200 por segundo (o lote do
  publicador). O assinante recebeu 500 mensagens com 500 ids distintos: sem
  perda e sem duplicata.
- Redis parado: a gravação no banco não depende do Redis; os 100 eventos
  ficaram pendentes, nenhum foi marcado e nenhum ganhou tentativa (o job do
  publicador vem do próprio Redis, então ele nem rodou). Um segundo depois de
  o Redis voltar, a outbox estava vazia.
- Achado: o assinante do pub/sub não recebeu os 100 eventos publicados logo
  depois da volta. O pub/sub do Redis não guarda mensagem para quem está
  desconectado, e o assinante reconectou depois da publicação. A outbox
  garante que o evento sai; quem consome o tempo real (SSE, M13) precisa
  reconsultar o estado ao reconectar. Registrado no ADR 0009.
- O worker reportou `REDIS_CONEXAO_FALHOU` uma vez por conexão (3), não uma
  vez por tentativa de reconexão, e saiu com código 0 no SIGTERM.

## 2. Testes de integração (Redis e Postgres reais)

`pnpm exec vitest run --project banco --reporter=verbose pacotes/infraestrutura/src/filas apps/worker/src/composicao`

```text
 ✓apps/worker/src/composicao/testes/encerramento.banco.test.ts > encerramento gracioso do worker > SIGTERM com job em andamento: o job termina e o processo sai com 0 3667ms
 ✓pacotes/infraestrutura/src/filas/testes/caixa-de-saida.banco.test.ts > publicador da caixa de saída > o evento gravado junto com o dado é publicado no canal do restaurante e marcado 158ms
 ✓pacotes/infraestrutura/src/filas/testes/caixa-de-saida.banco.test.ts > publicador da caixa de saída > dois publicadores simultâneos não publicam o mesmo evento duas vezes 306ms
 ✓pacotes/infraestrutura/src/filas/testes/caixa-de-saida.banco.test.ts > publicador da caixa de saída > matar o publicador no meio não perde evento e não marca nada pela metade 172ms
 ✓pacotes/infraestrutura/src/filas/testes/caixa-de-saida.banco.test.ts > publicador da caixa de saída > com o Redis parado a API grava, nada é marcado, e ao voltar os eventos saem 1131ms
 ✓pacotes/infraestrutura/src/filas/testes/caixa-de-saida.banco.test.ts > publicador da caixa de saída > carga: 500 eventos de 50 restaurantes, sem perda e sem duplicata 813ms
 ✓pacotes/infraestrutura/src/filas/testes/caixa-de-saida.banco.test.ts > trava distribuída > só uma instância ativa por vez, e a trava é liberada no fim 8ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > o mesmo jobId enfileirado duas vezes gera um job só 61ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > recusa ao enfileirar payload fora do contrato, job sem contrato e id fora do padrão 9ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > payload inválido no processamento vai para falhas sem nova tentativa 68ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > job que falha N vezes vai para falhas e só a última tentativa é reportada, com fila, job, tentativa e restaurante 165ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > processador com restauranteId roda dentro de comRestaurante e não alcança outro restaurante 76ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > job concluído fica com o resultado do processador 57ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > encerrar espera o job em andamento terminar 626ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > encerrar força o fechamento quando o job passa do limite 222ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > filas BullMQ com Redis e Postgres reais > registra os agendamentos uma vez só, mesmo chamado de novo 29ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > limite por restaurante (GCRA no Redis) > restaurante acima do limite recebe atraso e outro restaurante no mesmo instante não 11ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > limite por restaurante (GCRA no Redis) > as filas com limite têm valores coerentes no registro 1ms
 ✓pacotes/infraestrutura/src/filas/testes/filas.banco.test.ts > erros de domínio do job > payload inválido é falha definitiva 0ms
 ✓pacotes/infraestrutura/src/filas/testes/expirar-sessoes-mesa.banco.test.ts > rotina expirar-sessoes-mesa > fecha só as vencidas, em lotes, grava um evento por sessão e é idempotente 338ms
 ✓pacotes/infraestrutura/src/filas/testes/expirar-sessoes-mesa.banco.test.ts > rotina expirar-sessoes-mesa > fechar só alcança o restaurante informado 55ms
 Test Files  4 passed (4)
      Tests  21 passed (21)
```
