# M10: Assinaturas e cobrança pelo Mercado Pago

## Contexto

M00 a M09 aceitos. Há restaurantes em teste, filas e outbox, a fila `pagamentos` registrada (vazia), a porta do limite de mesas aberta desde o M08 (hoje constante `LIMITE_MESAS_TESTE = 30`) e o campo `planos.mp_plano_id`. Falta cobrar.
Este é o módulo mais sensível: entra dinheiro e um erro libera ou corta o acesso de um restaurante. Capriche nos testes e no que vai ao Sentry.
Leia antes: CLAUDE.md; ADRs 0005, 0006, 0009 e 0012; no plano, a seção 1 (RF11, regra 7 e 8), a seção 5 (webhook do Mercado Pago, passo a passo) e a seção 7 (assinatura, tópicos, campos). E a seção "Assinatura pelo Mercado Pago" do plano.

## Objetivo

O restaurante escolhe o plano ao fim do teste de 10 dias, assina pelo Mercado Pago, e o acesso muda só quando o pagamento é confirmado pela reconsulta à API. Inadimplência tratada pela regra 8: aviso no dia 1, pedidos pela mesa suspensos no dia 15, cardápio nunca fora do ar. O limite de mesas passa a vir do plano.

## Regra que atravessa o módulo

Webhook: validar HMAC, gravar o evento, enfileirar, responder 200 em menos de 1 s (o limite do Mercado Pago é 22 s). O corpo do webhook NUNCA é confiado. Só o worker muda a assinatura, e só depois de reconsultar o recurso na API do Mercado Pago.
Transação curta, chamada externa fora da transação (como M07):

1. transação curta: ler o evento, marcar em processamento;
2. fora de transação: reconsultar o recurso na API do Mercado Pago;
3. transação curta: aplicar a mudança em `assinaturas`/`cobrancas` e emitir o evento, só se a situação mudou.

## Escopo

Dentro:

- Tabelas e migrações: `planos` (semeados), `assinaturas`, `cobrancas`, `eventos_pagamento` (as três últimas com RLS; `eventos_pagamento` é de sistema, acessível pelo `app_sistema`).
- Porta `GatewayPagamento` e o adaptador Mercado Pago (criar assinatura, reconsultar recurso, validar assinatura do webhook).
- Casos de uso: `EscolherPlanoEAssinar`, `ProcessarEventoPagamento` (no worker), `ConciliarCobrancas` (rotina diária), `AplicarInadimplencia` (rotina diária), `ObterLimiteDeMesas` (completa a porta do M08).
- API: rota do webhook (pública, sem sessão, com validação HMAC) e a rota do painel para escolher plano e obter o `init_point`.
- Worker: processador da fila `pagamentos` e as rotinas.
- Painel: tela de plano e cobrança (escolher plano, ver situação, histórico de cobranças, link para o checkout).
- O "pedido suspenso por inadimplência" só como estado e regra; a tela do cliente que respeita isso é do M11.
- ADR 0014.

Fora: Pix na mesa para o cliente (V2); o admin de cobranças (M15; aqui só os dados e a rota, não a tela do admin); nota fiscal (fora do MVP, registrar como pendência jurídica).

## Antes de codar

Confira na documentação oficial do Mercado Pago, hoje, e cite as URLs:

1. Assinaturas (preapproval): criar com plano (`preapproval_plan_id`) x sem plano; `external_reference`; `init_point`; situações possíveis.
2. Webhook: formato do `x-signature` (`ts=...,v1=...`), o `x-request-id`, o `data.id` da query, o manifesto exato do HMAC (`id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;`), HMAC-SHA256 com o segredo; tópicos `subscription_preapproval`, `subscription_authorized_payment` e `payment`; a janela de 22 s; as novas tentativas a cada 15 min e o fato de poderem vir com outro `x-request-id`.
3. Reconsulta: endpoints `/preapproval/search` ou `/preapproval/{id}`, `/authorized_payments/{id}`, `/v1/payments/{id}`.
4. SDK: o pacote oficial `mercadopago` (versão, Node suportado) ou chamada HTTP direta. Decida e registre. Se algo divergir deste prompt, siga a documentação e explique no PR.

## Decisões já tomadas

- Planos no banco, semeados por migração, cada um com `limite_mesas`, `preco_centavos` e `mp_plano_id`. Os valores de preço entram como placeholder a confirmar (o preço final é decisão do dono antes do piloto): deixe-os numa migração fácil de ajustar e registre que são provisórios.
- `external_reference = restaurante_id` na criação da assinatura.
- Idempotência de efeito, não por `x-request-id`: como uma nova tentativa pode vir com outro id, o worker reconsulta e só aplica se a situação da assinatura/cobrança mudou, numa transação com trava na linha da assinatura. O `eventos_pagamento` guarda cada evento recebido (auditoria e conciliação), único por (provedor, x_request_id).
- Assinatura inválida no webhook: 401, sem processar, com alerta de segurança (um por IP acima do limite, sem o corpo no Sentry).
- Se o Redis estiver fora ao receber o webhook: grava o evento e responde 200 mesmo assim; a conciliação diária reprocessa os eventos sem `processado_em`.
- Conciliação diária: compara cobranças em aberto com a API do Mercado Pago, para cobrir webhook perdido.
- Inadimplência (regra 8, prazos provisórios): dia 1 aviso, dia 15 os pedidos pela mesa são suspensos (estado do restaurante), o cardápio continua visível. Registre os prazos no ADR como ajustáveis.
- Limite de mesas: `ObterLimiteDeMesas` lê a assinatura ativa e o `planos.limite_mesas`; sem assinatura (em teste), devolve `LIMITE_MESAS_TESTE`. O caso de uso do M08 não muda.
- Segredos novos: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (por ambiente), nunca versionados. No teste e em local, um Mercado Pago falso (adaptador de teste atrás da porta), sem rede.

## Testes obrigatórios

- Validação HMAC: assinatura correta passa; `data.id` com maiúsculas é normalizado para minúsculas no manifesto; assinatura errada dá 401; faltando `ts` ou `v1` dá 401.
- Webhook responde 200 em menos de 1 s e enfileira; o corpo não é usado para mudar nada.
- Reprocessamento: o mesmo pagamento em dois webhooks (com `x-request-id` diferentes) muda a assinatura uma vez só.
- Webhook confirma, mas a reconsulta à API diz "não pago" ou falha: o acesso NÃO é liberado.
- A transação não fica aberta durante a reconsulta (teste que força lentidão no passo externo).
- `EscolherPlanoEAssinar` cria a assinatura com `external_reference` certo e devolve o `init_point`.
- Conciliação: um evento gravado sem `processado_em` (Redis estava fora) é reprocessado e aplica a mudança uma vez.
- Inadimplência: no dia 15 o restaurante fica suspenso para pedido, o cardápio continua respondendo; pagar reativa.
- Limite de mesas: em teste vale 30; com plano Básico vale o do plano; criar além do limite é recusado (o teste do M08 continua passando).
- Isolamento: `assinaturas` e `cobrancas` passam nos testes 1 a 8 do M02; um restaurante não vê a cobrança de outro; o `app_sistema` só toca `eventos_pagamento` e o que o ADR 0006 permite.
- Nada de segredo, token, corpo do webhook, e-mail ou documento no log ou no Sentry.
- Telas no Chromium com axe: escolher plano, ver situação e histórico.

## Critério de pronto

`pnpm verificar` e CI verdes; demonstração no PR com o Mercado Pago falso: criar assinatura, receber um webhook assinado, reconsultar e ativar; um webhook com assinatura errada recusado; a conciliação reprocessando um evento; a inadimplência suspendendo e o pagamento reativando. ADR 0014 e runbook `docs/runbooks/pagamentos.md` (segredos, sandbox, o que fazer quando um webhook some, como conferir uma assinatura na API).

## Proibido

Confiar no corpo do webhook; mudar assinatura fora do worker ou sem reconsulta; transação aberta durante a chamada ao Mercado Pago; tirar o cardápio do ar por inadimplência; segredo versionado; idempotência só por `x-request-id`; emoji.

## Entrega

Branch da sessão, atualizada a partir da main. Commits por assunto. PR `feat: assinaturas e cobrança pelo Mercado Pago (M10)`, com o que foi criado, as URLs da documentação, as demonstrações, os riscos (fiscal e de preço provisório) e sugestões.
