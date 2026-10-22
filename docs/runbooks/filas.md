# Runbook: filas e outbox

Decisões e motivos no [ADR 0009](../adr/0009-filas-e-outbox.md). Aqui ficam
os passos.

## Onde olhar

- Bull Board: `https://<DOMINIO_ADMIN>/api/v1/admin/filas`, com a sessão de
  admin e o segundo fator. Mostra as 5 filas (`pagamentos`, `midia`,
  `notificacoes`, `caixa-saida`, `rotinas`), os jobs por situação e os
  agendamentos. O payload aparece já limpo de dados pessoais.
- Sentry: filtro `app:worker`. Todo job que esgota as tentativas gera um
  evento com `fila`, `job_id`, `tentativa`, `restaurante_id`, `tarefa`
  (`{fila}.{job}`) e `falha_definitiva:sim`.
- Logs do worker: `tarefa iniciada`, `tarefa concluída` e
  `tarefa falhou; vai tentar de novo`, com o `id_rastreio` do job.

## Fila de falhas

Job que esgota as tentativas, ou que tem payload fora do contrato, fica na
aba **Failed** da fila, com o motivo e a pilha.

1. Abrir o evento no Sentry pelo `job_id` e ler o código do erro.
2. Payload inválido (`FILA_JOB_PAYLOAD_INVALIDO`): é defeito de quem
   enfileirou. Não reprocessar; corrigir o código e enfileirar de novo pelo
   fluxo normal. O erro lista os campos inválidos.
3. Dependência fora (`ErroDependenciaExterna`): confirmar que voltou e
   reprocessar (abaixo).
4. Isolamento (`ErroIsolamentoInquilino`): tratar como incidente, alerta 1
   do runbook do Sentry. Não reprocessar.

Retenção: falhas ficam 14 dias (30 em `pagamentos`) ou até 5.000 por fila.
Depois disso o BullMQ apaga sozinho.

## Reprocessar

- Um job: no Bull Board, aba **Failed**, botão **Retry** do job.
- Todos os de uma fila: aba **Failed**, **Retry all**.
- O processador confere o estado antes de agir, então reprocessar um job que
  já teve efeito não duplica o efeito.
- O botão só funciona no próprio admin: a ação exige o cabeçalho `Origin` do
  admin, e a sessão precisa do segundo fator.

## Alerta de fila parada

Dois monitores do Sentry Crons, criados pelo próprio worker na primeira
execução (não precisa cadastrar à mão):

| Monitor                        | Espera um check-in a cada | Margem |
| ------------------------------ | ------------------------- | ------ |
| `rotinas-expirar-sessoes-mesa` | 5 min                     | 10 min |
| `caixa-saida-publicador`       | 1 min                     | 5 min  |

No Sentry: **Monitors > Alerts > Create Alert**, Source **Alert on specific
monitors**, os dois monitores acima, notificação imediata.

Quando disparar:

1. O worker está de pé? Ver o processo no provedor e o log `worker pronto`.
2. O Redis responde? Log `REDIS_CONEXAO_FALHOU` no worker ou na API.
3. Agendamento sumiu? No Bull Board, fila `caixa-saida` e `rotinas`, aba de
   agendamentos (Job Schedulers). Reiniciar o worker recria os dois
   agendamentos (`upsertJobScheduler` não duplica).
4. Fila pausada? Bull Board, botão **Resume**.
5. Trava presa? A trava do publicador (`trava:publicar-caixa-saida`) expira
   sozinha em 30 s. Não apague à mão.

## Outbox com eventos parados

Consulta com o administrador do banco:

```sql
SELECT count(*), min(criado_em), max(tentativas)
FROM caixa_saida WHERE publicado_em IS NULL;
```

- Muitos pendentes e `tentativas` baixas: o publicador não está rodando; ver
  "Alerta de fila parada".
- Eventos com `tentativas = 10`: esgotaram e geraram
  `CAIXA_SAIDA_PUBLICAR_ESGOTADO` no Sentry. Corrigir a causa (o evento traz
  `eventoId` e `tipo`) e devolver para a fila:

  ```sql
  UPDATE caixa_saida SET tentativas = 0
  WHERE id = '<eventoId>' AND publicado_em IS NULL;
  ```

  Rodar como `cardapio_worker` com `SET ROLE app_sistema`, que tem permissão
  só para `publicado_em` e `tentativas`. O evento sai no próximo segundo.

## Redis fora do ar

- A API continua gravando: os eventos ficam na `caixa_saida`.
- O worker reconecta sozinho. Enquanto isso, o publicador não roda (o próprio
  job vem do Redis) e nada é marcado como publicado.
- Ao voltar, o publicador esvazia a outbox em lotes de 200 por segundo.
- Se algum evento ganhou tentativa durante a queda (o primeiro do lote, no
  máximo um por execução), ele sai normalmente na volta.

## Encerrar o worker

`SIGTERM` (o que o provedor manda no deploy): o worker para de pegar jobs,
espera os em andamento até 30 s, fecha as conexões e sai com 0. Configure a
janela de encerramento do provedor com pelo menos 35 s.

## Ajustar limites

Concorrência, tentativas, backoff, retenção e limite por restaurante ficam
em `pacotes/infraestrutura/src/filas/registro.ts`. Mudar ali vale no próximo
deploy. Restaurante acima do limite não perde job: o job entra com atraso.
