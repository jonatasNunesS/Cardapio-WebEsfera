# M05: Filas, outbox e limites por restaurante

## Contexto
M00 a M04 aceitos. Existem `caixa_saida` (M02), `comSistema()`,
`executarTarefa()` (M01) e o worker vazio. Ainda não há fila.

Leia antes: CLAUDE.md; ADRs 0005, 0006 e 0008; no plano, a seção 9
(filas, justiça entre restaurantes, falhas) e a seção 3 (cache no Redis).

## Objetivo
Infraestrutura de trabalho assíncrono confiável: um evento gravado junto
com o dado nunca se perde, um job nunca roda duas vezes com efeito
duplicado, um restaurante não atrasa os outros, e toda falha chega ao
Sentry com fila, job e restaurante.

## Escopo
Dentro: BullMQ e Redis; porta `FilaDeJobs` e adaptador; registro de filas;
publicador da `caixa_saida`; limite de taxa por restaurante; pub/sub para
o tempo real (só a porta `PublicadorTempoReal` e o adaptador, sem SSE);
fila de falhas e alerta; painel Bull Board no admin; rotina de expirar
sessões de mesa (primeiro job real); ADR 0009.

Fora: SSE e telas da fila (M13); jobs de mídia (M07), pagamento (M10) e
notificações (quando houver provedor).

## Antes de codar
Confira na documentação oficial e cite as URLs no PR:
1. BullMQ atual: `Queue`, `Worker`, `jobId` e deduplicação, `attempts` e
   `backoff`, `removeOnComplete` e `removeOnFail`, jobs repetidos
   (`upsertJobScheduler` ou o equivalente atual), `limiter`, prioridade,
   encerramento gracioso e eventos.
2. ioredis: conexão para BullMQ (`maxRetriesPerRequest: null`) e
   reconexão.
3. Bull Board com Fastify: proteção por autenticação.
4. PostgreSQL: `FOR UPDATE SKIP LOCKED` e `LISTEN/NOTIFY` (se for usar
   para acordar o publicador mais cedo).

## Decisões já tomadas
- Redis com `appendonly` (já no compose). Uma conexão para filas, outra
  para cache e pub/sub.
- Filas iniciais registradas, mesmo vazias: `pagamentos`, `midia`,
  `notificacoes`, `caixa-saida`, `rotinas`. Configuração por fila
  (concorrência, tentativas, backoff, prioridade, retenção) num registro
  único em `infraestrutura/filas/registro.ts`.
- Payload de todo job validado por Zod (`contratos`) ao enfileirar e ao
  processar. Payload inválido não é reprocessado: vai direto para falhas.
- Todo processador roda dentro de `executarTarefa()`, e quando o job tem
  `restauranteId`, dentro de `comRestaurante()`.
- `jobId` determinístico (recurso + ação + versão) para deduplicar.
- Idempotência de efeito: o processador confere o estado antes de agir;
  rodar o mesmo job duas vezes não muda o resultado.
- Depois das tentativas, o job fica na fila de falhas e gera evento no
  Sentry com `fila`, `job_id`, `tentativa` e `restaurante_id`.
- Justiça entre restaurantes (BullMQ aberto não tem limite por grupo):
  token bucket no Redis por `restaurante_id` e tipo de job antes de
  enfileirar; acima do limite o job entra com `delay`, nunca é descartado.
  Valores no registro e no ADR.
- Outbox: o publicador roda como job repetido a cada 1 s na fila
  `caixa-saida`, com trava para só uma instância ativa. Lê com
  `FOR UPDATE SKIP LOCKED` pelo `comSistema()`, publica no pub/sub e nas
  filas, marca `publicado_em`. Falha de publicação incrementa `tentativas`
  e não marca como publicado.
- Encerramento gracioso: no SIGTERM o worker para de pegar jobs, espera os
  em andamento (limite de 30 s) e fecha conexões.
- Redis fora do ar: a API continua gravando no banco (outbox guarda o
  evento); o worker reconecta sozinho; nada é perdido.
- Bull Board só no app admin, atrás da sessão de admin com segundo fator,
  e o payload exibido passa pela limpeza de dados pessoais.

## Rotina de exemplo (primeiro job real)
`expirar-sessoes-mesa`, a cada 5 minutos na fila `rotinas`: fecha sessões
de mesa com `expira_em` vencido, pelo `comSistema()`, em lotes de 500, e
grava um evento `SessaoMesaExpirada` na outbox por sessão.

## Testes obrigatórios (Redis e Postgres reais)
- Enfileirar com o mesmo `jobId` duas vezes gera um job só.
- Payload inválido vai para falhas sem nova tentativa.
- Job que falha N vezes vai para falhas, com o evento do Sentry (relator
  falso) contendo fila, job, tentativa e restaurante.
- Processador com `restauranteId` roda dentro do contexto certo; tentar
  ler dado de outro restaurante falha (isolamento do M02).
- Outbox: evento gravado com o dado é publicado; matar o publicador no
  meio não perde nem duplica; dois publicadores simultâneos não publicam
  o mesmo evento duas vezes.
- Token bucket: um restaurante acima do limite recebe `delay`; outro
  restaurante no mesmo instante não é atrasado.
- SIGTERM com job em andamento: o job termina e o processo sai com 0.
- Redis parado: a API grava normalmente; ao voltar, os eventos saem.
- `expirar-sessoes-mesa`: fecha só as vencidas, em lotes, e é idempotente.
- Bull Board: sem sessão de admin, 401; com sessão de dono, 403.
- Carga: 500 eventos de 50 restaurantes publicados sem perda e sem
  duplicata.

## Critério de pronto
`pnpm verificar` e CI verdes; demonstração no PR do teste de carga e do
teste de Redis parado; ADR 0009 (filas e outbox) e runbook
`docs/runbooks/filas.md` (fila de falhas, reprocessar, alerta de fila
parada).

## Proibido
Job sem validação de payload; processador fora de `executarTarefa()`;
descartar job por limite; `app_sistema` lendo tabela de negócio; payload
com dado pessoal; emoji.

## Entrega
Branch da sessão, atualizada a partir da main. Commits por assunto. PR
`feat: filas, outbox e limites por restaurante (M05)`, com o que foi
criado, URLs, demonstrações, riscos e sugestões.
