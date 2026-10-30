# Pagamentos pelo Mercado Pago

Como a cobrança funciona e o que fazer quando algo foge do normal. Decisões em
[ADR 0014](../adr/0014-assinaturas-e-cobranca.md).

## Segredos

| Variável            | Onde        | O que é                                                                                |
| ------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `MP_ACCESS_TOKEN`   | API, worker | Access token da aplicação no Mercado Pago (credencial de teste no sandbox).            |
| `MP_WEBHOOK_SECRET` | API         | Assinatura secreta das notificações, gerada no painel do Mercado Pago.                 |
| `URL_MERCADO_PAGO`  | API, worker | Vazio em produção (`https://api.mercadopago.com`). Outro valor só com `APP_ENV=local`. |

- Um par de credenciais por ambiente: teste em preview e homologação,
  produção só em produção. Nunca no repositório, no `.env.exemplo` com valor
  real, em issue ou em log.
- Trocar o `MP_WEBHOOK_SECRET`: gere a nova assinatura no painel do Mercado
  Pago e atualize a API em seguida. Entre um passo e outro, os avisos chegam
  com a assinatura velha, recebem 401 e o Mercado Pago tenta de novo; o que
  se perder a conciliação diária recupera.
- Trocar o `MP_ACCESS_TOKEN`: atualize API e worker juntos. Durante a troca,
  reconsultas falham e a fila `pagamentos` tenta de novo (8 vezes, com espera
  exponencial).

## Sandbox, antes do piloto

O M10 foi feito contra o Mercado Pago falso. Com as credenciais de teste,
num ambiente de homologação:

1. Configure no painel do Mercado Pago a URL de notificação
   `https://<painel>/api/v1/webhooks/mercado-pago` com os tópicos de
   assinaturas (`subscription_preapproval`, `subscription_authorized_payment`)
   e copie a assinatura secreta para `MP_WEBHOOK_SECRET`.
2. No painel do restaurante, em Plano e cobrança, assine o Básico com o
   e-mail de um comprador de teste e siga o link "Pagar no Mercado Pago".
3. Confira: a assinatura foi criada sem plano com `status: pending`; o
   `init_point` abriu o checkout; o aviso chegou e não deu 401 (o log da API
   tem `pagamento.aviso` com `desfecho: aceito`); o restaurante virou `ativo`
   depois da primeira cobrança paga.
4. Confira o formato que a documentação descreve e registre no ADR 0014 o que
   divergir: manifesto do HMAC, `data.id` em minúsculas, se as novas
   tentativas trazem `ts` e `x-request-id` novos, e a busca
   `GET /authorized_payments/search?preapproval_id=<id>`.

Desenvolvimento local, sem rede: `pnpm mp:falso` sobe o Mercado Pago falso em
`127.0.0.1:3999`. Ponha no `.env` `URL_MERCADO_PAGO=http://127.0.0.1:3999` e,
para o falso mandar avisos, `URL_AVISO_FALSO=http://127.0.0.1:3000/api/v1/webhooks/mercado-pago`.
Para simular o Mercado Pago:

```sh
curl -X POST http://127.0.0.1:3999/__falso/assinaturas            # lista id e external_reference
curl -X POST http://127.0.0.1:3999/__falso/autorizar/<preapproval_id>
curl -X POST "http://127.0.0.1:3999/__falso/cobrar/<preapproval_id>?pagamento=approved"
curl -X POST "http://127.0.0.1:3999/__falso/fora?valor=1"           # simula indisponibilidade
```

## Um aviso sumiu

Sintoma: o dono pagou, o Mercado Pago mostra a cobrança paga e o painel ainda
mostra teste, carência ou inadimplente.

1. Veja se o aviso chegou: `SELECT id, topico, recurso_id, recebido_em,
tentativas, processado_em, ultimo_erro_codigo FROM eventos_pagamento ORDER
BY recebido_em DESC LIMIT 20;` (como administrador do banco).
2. Chegou e `processado_em` é nulo: veja o job `evento-<id>` na fila
   `pagamentos` do Bull Board. `PAGAMENTO_PROCESSAR_TENTATIVAS_ESGOTADAS` quer
   dizer que as 8 tentativas falharam; o motivo está no Sentry.
3. Não chegou: confira no painel do Mercado Pago o histórico de notificações
   e a URL configurada. Uma sequência de 401 no log da API indica segredo
   trocado; há alerta `PAGAMENTO_AVISO_ASSINATURA_INVALIDA` no Sentry por
   origem.
4. A conciliação diária (`conciliar-cobrancas`) reconsulta toda assinatura
   viva e reenfileira os eventos parados. Para não esperar, rode-a pelo Bull
   Board (fila `rotinas`, agendamento `conciliar-cobrancas`) ou reenfileire o
   job `conciliar-assinatura` do restaurante.

Nunca altere `assinaturas`, `cobrancas` ou `restaurantes.situacao` à mão: só
o worker muda a assinatura, e só depois de reconsultar.

## Conferir uma assinatura na API

Com o token do ambiente (nunca cole o token em chat ou issue):

```sh
curl -s -H "Authorization: Bearer $MP_ACCESS_TOKEN" https://api.mercadopago.com/preapproval/<preapproval_id>
curl -s -H "Authorization: Bearer $MP_ACCESS_TOKEN" "https://api.mercadopago.com/authorized_payments/search?preapproval_id=<preapproval_id>"
```

Compare `status` e `external_reference` (o id do restaurante) com
`assinaturas.situacao` e `assinaturas.restaurante_id`, e o `payment.status`
de cada cobrança com `cobrancas.situacao`.

## Régua da inadimplência

| Dia de atraso (fuso do restaurante) | Situação        | Efeito                                       |
| ----------------------------------- | --------------- | -------------------------------------------- |
| antes do vencimento                 | `teste`/`ativo` | normal                                       |
| 1 a 14                              | `carencia`      | aviso no painel; pedidos seguem              |
| 15 em diante                        | `inadimplente`  | pedidos suspensos; o cardápio continua no ar |

O pagamento confirmado reativa na hora. Os prazos são constantes do domínio
(ADR 0014); mudar exige PR.
