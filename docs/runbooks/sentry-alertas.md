# Runbook: alertas do Sentry

Os 6 alertas da seção 8 do plano, para configurar manualmente no Sentry. O
caminho segue a documentação atual de Monitors e Alerts
(`docs/product/monitors-and-alerts/alerts/create-alerts.mdx` no repositório
getsentry/sentry-docs, consultado em 2026-10-21): **Monitors > Alerts >
Create Alert**, com Source, Environment e o construtor When, If e Then.

Tags que o código envia em todo evento: `app`, `modulo`, `caso_de_uso`,
`restaurante_id`, `rota`, `tarefa`, `codigo` e `id_rastreio`. O agrupamento é
`[codigo, modulo]`.

Ambiente: configure cada alerta para `producao`. Repita para `homologacao`
com destino mais barulhento, se quiser.

## 1. Isolamento quebrado

- Source: projetos `cardapio-backend` e `cardapio-frontend`.
- When: **An event or issue activity is captured**.
- If (all): **Event level** equals `fatal`; **Event attribute**
  `exception.type` equals `ErroIsolamentoInquilino`.
- Then: notificar o John por e-mail e celular (preferred channel).
- Throttling: **Get notified on every trigger**.
- O que fazer:
  1. Parar o que estiver em deploy.
  2. Abrir o evento e ler `restaurante_id`, `caso_de_uso` e o contexto
     `negocio`.
  3. Tratar como incidente de segurança. Avaliar em até 24 h e avisar os
     restaurantes afetados (seção 5).

## 2. Webhook com assinatura inválida

- Depende do código `WEBHOOK_ASSINATURA_INVALIDA`, criado no M10.
- Source: `cardapio-backend`.
- When: **An event or issue activity is captured**.
- If (all): **Tagged event** `codigo` equals `WEBHOOK_ASSINATURA_INVALIDA`;
  **Number of events** more than 5 in 15 minutes. A documentação oferece
  intervalos de 5 e 15 minutos, não de 10; use 15.
- Then: notificação imediata.
- O que fazer: conferir se o segredo do webhook mudou no Mercado Pago. Se não
  mudou, é tentativa de fraude: bloquear a origem no WAF e guardar os eventos.

## 3. Pagamento não processado

- Depende da fila `pagamentos` (M05 e M10). O M05 precisa marcar a última
  tentativa com a tag `falha_definitiva` igual a `sim`.
- Source: `cardapio-backend`.
- When: **An event or issue activity is captured**.
- If (all): **Tagged event** `tarefa` starts with `pagamentos.`; **Tagged
  event** `falha_definitiva` equals `sim`.
- Then: notificação imediata.
- O que fazer: abrir o job na fila de falhas (Bull Board, M15), conferir o
  pagamento direto no Mercado Pago e reprocessar. A conciliação diária cobre se
  ninguém agir.

## 4. Taxa de erro acima de 1% por 5 minutos, por app

- Tipo: **Metric Monitor** (Monitors > Create Monitor), um por app, porque a
  tag `app` separa api e worker dentro do mesmo projeto.
- Dataset: spans. Métrica: taxa de falha das requisições ou tarefas. Filtro:
  `app:api` (repita para `worker`, `cardapio`, `painel` e `admin`). Intervalo
  de 5 minutos. Limite fixo: 1%.
- Ligar um Alert ao Monitor (Source: **Alert on specific monitors**) com
  notificação imediata.
- O que fazer: abrir a release mais recente. Se o salto começou no deploy,
  voltar a imagem anterior (rollback em até 5 minutos, seção 10).

## 5. Novo problema na release

- Source: os dois projetos.
- When: **A new issue is created**.
- If (all): **Latest release**.
- Then: e-mail para o John.
- Throttling: 24 hours. O plano pede resumo por e-mail; o Sentry não tem
  resumo diário nativo neste fluxo, então o throttling limita a uma mensagem
  por issue por dia.
- O que fazer: triar no dia seguinte ao deploy.

## 6. Restaurante concentrando erros

- Limitação: os alertas do Sentry contam eventos por issue, e o subfiltro de
  frequência exige um valor fixo de tag. Não há contagem agrupada por
  `restaurante_id` entre issues diferentes.
- Proposta para o piloto (3 a 5 restaurantes): um Alert por restaurante.
  When: **An event or issue activity is captured**. If: **Number of events**
  more than 20 in one hour, com o subfiltro `restaurante_id is <id do
restaurante>`. Then: e-mail.
- Complemento: um widget no dashboard com a contagem de erros por
  `restaurante_id` na última hora.
- Para depois do piloto: decidir entre uma rotina (fila `rotinas`, M05) que
  consulta a API do Sentry ou um alerta por agrupamento, se o Sentry passar a
  oferecer. A decisão é do John.
- O que fazer: abrir o filtro `restaurante_id:<id>`. Costuma ser cardápio
  com dado ruim ou plano inadimplente; confirmar antes de mexer.

## Antes de configurar

- Criar os projetos `cardapio-backend` (plataforma Node) e
  `cardapio-frontend` (plataforma React).
- No GitHub, criar os segredos `SENTRY_AUTH_TOKEN` (token de organização com
  permissão de releases e source maps), `SENTRY_ORG`,
  `SENTRY_PROJETO_BACKEND`, `SENTRY_PROJETO_FRONTEND` e
  `SENTRY_DSN_FRONTEND`.
- Nos ambientes, definir `SENTRY_DSN_BACKEND` para api e worker.
- Conferir no projeto a opção de limpeza do lado do servidor (Data Scrubber)
  ligada, como segunda barreira.
