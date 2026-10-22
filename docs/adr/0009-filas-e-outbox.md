# ADR 0009: Filas, outbox e limites por restaurante

- Situação: proposta (M05)
- Data: 2026-10-22

## Contexto

O M05 cria o trabalho assíncrono do produto: as filas do BullMQ, o
publicador da `caixa_saida` (outbox criada no M02), o limite por restaurante
antes de enfileirar, o pub/sub do tempo real e a primeira rotina real
(`expirar-sessoes-mesa`). As regras do prompt (`docs/prompts/m05-filas-outbox.md`)
valem como requisito; este ADR registra como foram cumpridas e o que cada
biblioteca faz de fato.

| Componente          | Versão |
| ------------------- | ------ |
| bullmq              | 6.3.11 |
| ioredis             | 6.0.0  |
| @bull-board/api     | 9.10.2 |
| @bull-board/fastify | 9.10.2 |
| Redis (compose, CI) | 8.8.3  |

O `msgpackr-extract` (dependência opcional do BullMQ) quer rodar script de
instalação. Ficou `false` em `allowBuilds`, como os outros; o `msgpackr` cai
na implementação em JavaScript.

## Decisões

### Garantia de entrega: pelo menos uma vez, com deduplicação

Entrega exatamente uma vez entre Postgres e Redis não existe: o publicador
publica e depois marca `publicado_em`; se o processo morre entre os dois, o
evento sai de novo na volta. O contrário (marcar antes de publicar) perde
evento. A escolha é **pelo menos uma vez**, e o efeito duplicado é barrado em
dois pontos:

- Jobs criados a partir de evento usam `jobId` `evento-{id do evento}-{job}`.
  O BullMQ ignora um `add` com `jobId` que já existe, então a republicação não
  cria job novo enquanto o job anterior estiver retido (1 dia para
  concluídos). Republicação depois disso só acontece se o evento ficar mais
  de um dia sem ser marcado, e o processador ainda confere o estado antes de
  agir.
- A mensagem de tempo real leva o `id` do evento. O consumidor (SSE, M13)
  descarta id repetido.

O teste "matar o publicador no meio" mostra isso: 20 eventos, o processo morre
depois do quinto; nada é marcado pela metade, os 20 saem na volta e os 5 já
publicados aparecem de novo com o mesmo id.

### Registro único das filas

`pacotes/infraestrutura/src/filas/registro.ts` define, por fila: concorrência,
tentativas, backoff, prioridade, retenção de concluídos e de falhas, e limite
por restaurante.

| Fila           | Concorrência    | Tentativas | Backoff           | Prioridade | Limite por restaurante |
| -------------- | --------------- | ---------- | ----------------- | ---------- | ---------------------- |
| `pagamentos`   | 5               | 8          | exponencial, 5 s  | 1          | 120/min, rajada de 30  |
| `midia`        | núcleos menos 1 | 5          | exponencial, 10 s | 5          | 30/min, rajada de 10   |
| `notificacoes` | 10              | 5          | exponencial, 3 s  | 3          | 60/min, rajada de 20   |
| `caixa-saida`  | 1               | 1          | fixo, 1 s         | 1          | não se aplica          |
| `rotinas`      | 2               | 3          | exponencial, 30 s | 5          | não se aplica          |

Retenção: concluídos por 1 dia (até 1.000 jobs), falhas por 14 dias (até
5.000); `pagamentos` guarda falhas por 30 dias. As 5 filas existem mesmo
vazias, para o Bull Board e o runbook já as mostrarem.

A prioridade do BullMQ vale dentro de uma fila, e job sem prioridade passa na
frente de job com prioridade. Por isso todo job recebe a prioridade da sua
fila; a separação entre tipos de trabalho é feita pelas filas e pela
concorrência de cada uma, como no plano.

### Payload validado na entrada e na saída

`contratos/src/filas/jobs.ts` tem o esquema Zod de cada job (estrito, sem
campo a mais). O adaptador `FilaDeJobs` valida antes do `add`; o trabalhador
valida de novo antes de chamar o processador. Payload inválido no
processamento vira `UnrecoverableError` do BullMQ: vai direto para falhas, sem
nova tentativa, e reporta uma vez. O erro leva só os caminhos dos campos
inválidos, nunca os valores.

O `jobId` precisa casar `PADRAO_DO_ID_DO_JOB`: sem `:` (o BullMQ usa como
separador de chave) e não só dígitos (o BullMQ reserva para ids automáticos).

### Todo processador dentro de executarTarefa e, com restaurante, de comRestaurante

O trabalhador (`filas/trabalhadores.ts`) recebe o `executarTarefa` do worker
por injeção, porque a infraestrutura não importa o app. A tarefa se chama
`{fila}.{job}` (por exemplo `pagamentos.processar-webhook`), o que casa com o
alerta 3 do runbook do Sentry. Quando o payload tem `restauranteId`, o
processador recebe a transação aberta por `comRestaurante()`; o RLS do M02
barra leitura e escrita de outro restaurante (teste de isolamento).

### Falha só vai ao Sentry na última tentativa

Tentativa que ainda vai se repetir vira log de aviso. A última (ou a falha
definitiva) chama `reportarErro` com as tags `fila`, `job_id`, `tentativa`,
`restaurante_id` e `falha_definitiva=sim`. Um job que falha 3 vezes gera um
evento, não três.

### Justiça entre restaurantes: GCRA no Redis

O BullMQ aberto não limita por grupo (só o Pro). Antes de enfileirar, um script
Lua aplica GCRA (a forma de token bucket que guarda um único horário teórico
por chave) em `limite:jobs_{job}:{restaurante_id}`, com o relógio do próprio
Redis (`TIME`). Acima do limite, o script devolve o atraso em ms e o job entra
com `delay`; nunca é descartado. Outro restaurante no mesmo instante não é
afetado (teste). O registro guarda os valores de cada fila.

### Outbox: job repetido a cada segundo, com trava e SKIP LOCKED

- O agendamento usa `upsertJobScheduler` (o BullMQ 6 removeu `repeat` no
  `add`): `publicar-caixa-saida` a cada 1 s e `expirar-sessoes-mesa` a cada
  5 min. Chamar de novo não duplica o agendamento.
- O processador pega uma trava no Redis (`SET NX PX` com dono e liberação
  por script que confere o dono) para só uma instância publicar por vez.
- A leitura usa `FOR UPDATE SKIP LOCKED` dentro de `comSistema()`, em lotes
  de 200, ordenados por `criado_em`. Mesmo sem a trava, dois publicadores não
  pegam o mesmo evento (teste com dois publicadores e com carga de 500
  eventos de 50 restaurantes).
- Falha de publicação incrementa `tentativas` e não marca. Com 10 tentativas
  o evento para de ser lido e gera `CAIXA_SAIDA_PUBLICAR_ESGOTADO` no Sentry.
- Falha de dependência (Redis fora) interrompe o lote no primeiro evento: só
  ele ganha uma tentativa. Sem isso, 10 segundos de Redis fora esgotariam todo
  o lote.
- Erro que não é `ErroAplicacao` (um defeito) desfaz o lote inteiro e sobe
  para o tratador do job.

`LISTEN/NOTIFY` para acordar o publicador antes de 1 s ficou de fora: o
intervalo de 1 s cabe na meta de 2 s do plano, e o `LISTEN` exige uma conexão
dedicada fora do pool.

### Conexões

- Filas, produtor (`criarConexoesDeFila().produtora`):
  `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`. Com o Redis fora o
  `add` falha na hora, e o evento continua na outbox.
- Filas, consumidor: `maxRetriesPerRequest: null`, como o BullMQ exige para
  o `Worker`. O ioredis reconecta sozinho com a estratégia padrão.
- Cache, trava e pub/sub: a conexão de `criarRedis` que a API já usava.
- O Redis roda com `appendonly yes` e `maxmemory-policy noeviction`, como a
  documentação do BullMQ pede para produção.

### Encerramento gracioso

No SIGTERM o worker chama `worker.close()` de cada fila, que para de pegar job
e espera os em andamento. O limite é 30 s; passou, o encerramento segue sem
esperar. Se o Redis está fora e nenhum job está rodando, não espera nada: o
`close()` do BullMQ não termina sem Redis (verificado). Depois fecha filas,
conexões e banco, e sai com 0.

### Bull Board só no admin

Em `/api/v1/admin/filas`, só no host do admin. Sem sessão de admin com
segundo fator, 401; com sessão de dono de restaurante, 403. Ações de escrita
(reprocessar, pausar, limpar) exigem o cabeçalho `Origin` do próprio admin. O
payload e o resultado exibidos passam por `limparValor` (`setFormatter`).

### Fila parada

Dois monitores do Sentry Crons, criados pelo código (`withMonitor` e
`captureCheckIn` com configuração):

- `rotinas-expirar-sessoes-mesa`: intervalo de 5 min, margem de 10 min.
- `caixa-saida-publicador`: um check-in por minuto no máximo, margem de 5 min.

Worker parado ou fila travada deixa de mandar check-in e o Sentry abre um
problema (a meta do plano é alertar em até 15 min).

### Rotina expirar-sessoes-mesa

Como o John decidiu: `comSistema()` só lista os ids vencidos (lotes de 500,
até 20 lotes por execução); para cada restaurante, `comRestaurante()` fecha as
sessões e grava `SessaoMesaExpirada` na outbox na mesma transação. O
`app_sistema` não ganhou permissão nova. O `UPDATE` só pega sessão ainda aberta
e vencida, então rodar de novo não muda nada.

## Consequências

- Os testes de banco (`*.banco.test.ts`) precisam de Redis além de
  Postgres. O CI ganhou o serviço `redis` no job de verificação.
- Consumidor de evento precisa deduplicar pelo id (contrato da mensagem).
- O pub/sub do Redis não guarda mensagem para assinante desconectado. Na
  demonstração com o Redis parado, a outbox publicou os 100 eventos um
  segundo depois da volta, antes de o assinante reconectar, e ele não os
  recebeu. O SSE do M13 precisa reconsultar o estado ao reconectar (o plano
  já prevê o painel consultando a cada 5 s em "Atualização lenta").
- Vazão do publicador: 200 eventos por segundo (um lote por execução). O pico
  do plano (500 pedidos em 1 minuto) cabe com folga; acima disso, aumentar o
  lote ou rodar mais de um lote por execução.
- Processador com `restauranteId` roda dentro de uma transação. Processador
  que chama serviço externo demorado (mídia, pagamento) vai precisar de outra
  forma no M07 e no M10.
- Correção que veio junto: o pool do Postgres não ouvia `error` do cliente
  emprestado; uma conexão derrubada no meio de uma transação derrubava o
  processo. O teste da queda do publicador falhava antes da correção.

## Fontes consultadas

- https://docs.bullmq.io/guide/connections
- https://docs.bullmq.io/guide/queues
- https://docs.bullmq.io/guide/workers
- https://docs.bullmq.io/guide/jobs/job-ids
- https://docs.bullmq.io/guide/jobs/deduplication
- https://docs.bullmq.io/guide/retrying-failing-jobs
- https://docs.bullmq.io/guide/queues/auto-removal-of-jobs
- https://docs.bullmq.io/guide/job-schedulers
- https://docs.bullmq.io/guide/rate-limiting
- https://docs.bullmq.io/guide/jobs/prioritized
- https://docs.bullmq.io/guide/workers/graceful-shutdown
- https://docs.bullmq.io/guide/workers/stalled-jobs
- https://docs.bullmq.io/guide/events
- https://docs.bullmq.io/guide/going-to-production
- https://docs.bullmq.io/patterns/stop-retrying-jobs
- https://github.com/redis/ioredis#auto-reconnect
- https://github.com/felixmosh/bull-board (exemplos `with-fastify` e
  `with-fastify-auth`)
- https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE
- https://www.postgresql.org/docs/current/sql-notify.html
- https://node-postgres.com/apis/pool
- https://github.com/getsentry/sentry-docs/blob/master/includes/javascript-crons-upsert.mdx
