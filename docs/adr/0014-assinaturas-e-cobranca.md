# ADR 0014: Assinaturas e cobrança pelo Mercado Pago

- Situação: proposta (M10)
- Data: 2026-10-30

## Contexto

O M10 cobra o restaurante: ele escolhe o plano, assina pelo Mercado Pago, e o
acesso muda só quando o pagamento é confirmado por reconsulta à API. As regras
do prompt (`docs/prompts/m10-assinaturas-e-cobranca.md`) valem como requisito.
É o módulo mais sensível: um erro libera ou corta o acesso de um restaurante.

Decisões do John antes de codar (2026-10-30):

1. `data.id` em minúsculas no manifesto do HMAC é obrigatório. O guia do SDK
   pede para passar o valor "cru"; o prompt está certo e o SDK não normaliza.
2. Chamada HTTP direta, sem o SDK: quatro endpoints, e controle total do que
   vai para log e Sentry.
3. Assinatura sem plano do Mercado Pago (`status: "pending"`,
   `external_reference = restaurante_id`). `planos.mp_plano_id` fica anulável
   e sem uso.
4. `teste_termina_em = criado_em + 10 dias`, com backfill. Teste vencido segue
   a mesma régua da inadimplência.
5. Dois planos provisórios: Básico, 10 mesas, R$ 99; Pro, 30 mesas, R$ 149.
6. Inadimplência: carência do dia 1 ao 14, inadimplente a partir do dia 15, no
   fuso do restaurante; pagamento reativa.

| Componente                     | Versão                        | Uso                                    |
| ------------------------------ | ----------------------------- | -------------------------------------- |
| API do Mercado Pago            | `https://api.mercadopago.com` | 4 endpoints por `fetch`                |
| SDK `mercadopago` (consultado) | 3.6.1, Node >= 18             | Referência de contratos; não instalado |

## Decisões

### Risco: documentação oficial não conferida ao vivo

O domínio `www.mercadopago.com.br` não abriu nesta sessão. Os contratos vieram
do código e dos guias do SDK oficial (lista em Fontes). O M10 roda só contra o
Mercado Pago falso. **Antes do piloto**, no sandbox, conferir: criação de
assinatura sem plano com `status: "pending"` e o `init_point` devolvido; os
tópicos e o formato do aviso; se as novas tentativas (a cada 15 minutos) trazem
`ts` novo; e a busca `authorized_payments/search?preapproval_id=`. O roteiro
está no runbook `docs/runbooks/pagamentos.md`.

### Quatro endpoints, por HTTP direto

| Operação               | Endpoint                                             |
| ---------------------- | ---------------------------------------------------- |
| Criar assinatura       | `POST /preapproval` com `X-Idempotency-Key`          |
| Reconsultar assinatura | `GET /preapproval/{id}`                              |
| Reconsultar cobrança   | `GET /authorized_payments/{id}`                      |
| Listar cobranças       | `GET /authorized_payments/search?preapproval_id=...` |

- Tempo máximo por chamada: 8 s na API, 10 s no worker. Sem redirecionamento.
- A resposta passa por Zod. `init_point` só é aceito com `https` e host
  `mercadopago.com` ou `mercadopago.com.br`; outro host é resposta inválida.
- Erro vira `ErroDependenciaExterna` com operação e status HTTP, nunca com o
  corpo nem o token. `404` numa consulta vira "não existe" (o evento é
  concluído sem efeito); `401` e `5xx` são falha e a fila tenta de novo.
- Situação desconhecida vira a mais conservadora: assinatura `pendente`,
  cobrança `agendada`. Nenhuma das duas libera acesso.
- O tópico `payment` é gravado e concluído sem efeito: a cobrança da
  assinatura chega por `subscription_authorized_payment`, que traz o
  pagamento embutido. A conciliação cobre o resto.

### Aviso (webhook)

Rota pública `POST /api/v1/webhooks/mercado-pago`, só no host do painel, com
limite de 120 por minuto por IP e corpo de até 16 KB. O corpo nunca é lido.

1. `data.id` da URL em minúsculas.
2. HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com
   `MP_WEBHOOK_SECRET`, comparado em tempo constante com o `v1` do
   `x-signature`. Faltando `ts`, `v1`, `x-request-id` ou `data.id`: 401.
3. Assinatura inválida: 401, nada gravado. Um contador no Redis por origem
   mascarada (janela de 15 minutos) dispara **um** alerta
   `PAGAMENTO_AVISO_ASSINATURA_INVALIDA` ao chegar a 10, com a origem e a
   contagem, sem corpo nem cabeçalhos.
4. Grava em `eventos_pagamento` por `app.registrar_evento_pagamento`, única
   por `(provedor, x_request_id)`; repetido devolve o mesmo evento.
5. Enfileira `processar-evento-pagamento` (id do job `evento-<id>`) com espera
   máxima de 300 ms. Com o Redis fora, o aviso fica gravado, o adiamento vai
   para o Sentry e a resposta é 200 do mesmo jeito. A conciliação reprocessa.
6. Responde 200. Medido nos testes: abaixo de 1 s com e sem Redis (o limite
   do Mercado Pago é 22 s).

Sem tolerância de horário no `ts` por enquanto: o guia do SDK sugere 300 s,
mas não confirmamos se as novas tentativas trazem `ts` novo. Um aviso repetido
só provoca uma reconsulta, que não muda nada (idempotência pelo efeito).
Revisitar depois do sandbox.

### Processamento no worker: três passos

1. Transação curta (`comSistema`): marca `em_processamento_em` e soma
   `tentativas`, só se `processado_em` é nulo. Devolve tópico e recurso.
2. Fora de transação: reconsulta no Mercado Pago. Para cobrança, consulta a
   cobrança e depois a assinatura dela, para ter o `external_reference`.
3. Transação curta (`comRestaurante(external_reference)`): trava a linha do
   restaurante e a da assinatura (`FOR UPDATE`), decide e aplica.

Depois, outra transação curta marca `processado_em`. Se o processo cair entre
o passo 3 e essa marca, o reprocessamento não muda nada.

- O `external_reference` precisa ser um UUID e a assinatura precisa existir
  naquele restaurante. Sem isso, nada é aplicado: referência que não é UUID é
  reportada e concluída; assinatura ainda não gravada (corrida com a criação)
  lança erro e a fila tenta de novo, até 8 vezes. Esgotadas as tentativas, o
  evento guarda `PAGAMENTO_PROCESSAR_TENTATIVAS_ESGOTADAS` e fica para a
  conciliação.
- A decisão é uma função pura (`decidirPelaConsulta`): compara a assinatura e
  as cobranças guardadas com as consultadas e devolve nulo se nada mudou.
  Só então o repositório grava e insere na outbox `AssinaturaAlterada` e
  `RestauranteSituacaoAlterada`. Dois avisos do mesmo pagamento, com
  `x-request-id` diferentes, mudam a assinatura uma vez.
- Há teste que força lentidão na reconsulta e confere em `pg_stat_activity`
  que nenhuma conexão do worker fica `idle in transaction`, com um controle
  positivo para provar que a consulta enxerga uma transação aberta.

### Acesso pago e régua da inadimplência

- Cada cobrança paga cobre um mês a partir do vencimento (`debit_date`).
  `assinaturas.pago_ate` é o fim da maior cobertura.
- Vencimento do acesso = o maior entre `teste_termina_em` e `pago_ate`.
- Dia de atraso conta por data de calendário no fuso do restaurante: o dia
  em que o acesso vence é o dia 1.

| Constante (domínio)            | Valor | Efeito                                            |
| ------------------------------ | ----- | ------------------------------------------------- |
| `DIAS_DE_TESTE`                | 10    | `teste_termina_em = criado_em + 10 dias`          |
| `DIA_DA_CARENCIA`              | 1     | `carencia`: aviso no painel, pedidos seguem       |
| `DIA_DA_INADIMPLENCIA`         | 15    | `inadimplente`: pedidos suspensos, cardápio no ar |
| `MESES_COBERTOS_POR_PAGAMENTO` | 1     | Cobertura de cada cobrança paga                   |

Os prazos são provisórios e ajustáveis só nessas constantes.

- `podeReceberPedido(situacao)` é falso para `inadimplente` e `cancelado`.
  A tela do cliente que respeita isso é do M11.
- O cardápio nunca sai do ar por inadimplência: `app.resolver_mesa` e
  `app.resolver_cardapio` só recusam `cancelado`. Há teste.
- O M10 nunca põe um restaurante em `cancelado` nem o tira de lá.
- A régua roda no worker por evento (o pagamento reativa na hora) e numa
  rotina diária para quem só venceu.

### Rotinas diárias

| Job                     | Fila         | O que faz                                                                                                                      |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `conciliar-cobrancas`   | `rotinas`    | Reenfileira, uma vez por dia, eventos sem `processado_em` com mais de 10 minutos, e um `conciliar-assinatura` por restaurante. |
| `conciliar-assinatura`  | `pagamentos` | Reconsulta a assinatura viva e as cobranças dela e aplica com a mesma decisão do aviso.                                        |
| `aplicar-inadimplencia` | `rotinas`    | Aplica a régua em cada restaurante, com trava, e emite o evento só se a situação mudou.                                        |

A conciliação abre um job por restaurante para que a falha do Mercado Pago num
deles não derrube a rotina e cada um tenha as 8 tentativas da fila
`pagamentos`. Os jobs que chamam o Mercado Pago estão em
`JOBS_EM_TRANSACOES_CURTAS`: o trabalhador não abre transação em volta deles.

A régua diária roda a cada 24 horas a partir do início do worker, então o dia
15 pode ser aplicado com até um dia de atraso. Um pagamento reativa na hora.

### Escolher o plano

- Só o dono escolhe; dono e gerente veem a situação e o histórico.
- Exige `Idempotency-Key` (UUID), repassada ao Mercado Pago como
  `X-Idempotency-Key`. Mesmo plano já pendente devolve o mesmo link sem
  chamar o Mercado Pago; outro plano pendente cancela o anterior localmente.
  Assinatura autorizada ou pausada recusa a troca (suporte, por enquanto).
- Divergência de desenho: o e-mail do pagador é digitado na tela, não lido da
  conta. O Mercado Pago cobra a conta dona daquele e-mail, que pode não ser a
  de quem entra no painel, e assim não foi preciso uma função privilegiada
  nova para ler `usuarios`. O e-mail vai só para o Mercado Pago: não é gravado
  nem registrado em log.
- O limite de mesas (`ObterLimiteDeMesas`) é o do plano quando a assinatura
  está autorizada; em teste ou com assinatura pendente, `LIMITE_MESAS_TESTE`
  (30). O caso de uso do M08 não mudou.

### Banco

- `planos`: semeados em `0012_planos_provisorios.sql` por upsert em `codigo`.
  Trocar preço é uma migração nova igual a ela.
- `assinaturas` e `cobrancas`: tabelas de restaurante, PK composta, RLS
  forçado, só `SELECT`, `INSERT` e `UPDATE` para `app_runtime`. Uma assinatura
  não cancelada por restaurante (índice único parcial). `mp_assinatura_id` e
  `mp_cobranca_id` são únicos.
- `eventos_pagamento`: tabela de sistema sem `restaurante_id` (o aviso chega
  antes de sabermos de quem é). Política `USING (true)` só para `app_sistema`;
  o `app_runtime` não tem permissão nenhuma. O `app_sistema` tem `SELECT` e
  `UPDATE` só nas colunas de processamento.
- Divergência do ADR 0006, para menos: ele previa `assinaturas` e `cobrancas`
  também para o `app_sistema`. Não foi preciso. A rotina lista ids pela função
  `app.listar_restaurantes_para_cobranca` (só ids, em páginas) e lê cada
  restaurante por `comRestaurante()`.
- Backfill de `teste_termina_em`: o dono da tabela passa pela RLS forçada, então
  a migração desliga o `FORCE` só dentro da própria transação, atualiza e
  religa. A coluna passou a `NOT NULL` com padrão de 10 dias.

### Segredos e o Mercado Pago falso

- `MP_ACCESS_TOKEN` (API e worker) e `MP_WEBHOOK_SECRET` (API), por ambiente,
  fora do repositório. `URL_MERCADO_PAGO` aponta para outro endereço só com
  `APP_ENV=local`; fora disso, o ambiente recusa subir.
- Divergência do prompt: o Mercado Pago falso não é um adaptador em memória
  atrás da porta, e sim um servidor HTTP em `127.0.0.1`
  (`criarMercadoPagoFalso`, `pnpm mp:falso`). API e worker são processos
  separados e precisam ver o mesmo estado, e assim o adaptador HTTP real (Zod,
  tempo máximo, erros) é exercitado nos testes e no e2e. Não há rede externa.
  O falso também assina e envia o aviso, como o Mercado Pago faria.
- Nada de token, segredo, `x-signature`, corpo do aviso ou e-mail vai para log
  ou Sentry: o log HTTP registra só método e rota; a limpeza oculta chaves com
  `token`, `secret`, `signature` e `email`; os erros do adaptador não levam
  corpo. Há teste que lê o log da API depois de um aviso e de uma assinatura.

## Consequências

- O acesso só muda depois de uma resposta do Mercado Pago. Mercado Pago fora
  atrasa a ativação, mas nunca ativa por engano.
- Um aviso perdido (ou Redis fora) é recuperado em até um dia pela conciliação.
- Estorno de um pagamento já aplicado não reduz o acesso já pago no M10: o
  `pago_ate` do restaurante é o maior entre os registrados.
- Troca de plano com assinatura autorizada fica para depois (exige cancelar a
  assinatura no Mercado Pago, um quinto endpoint).
- Pendência jurídica: nota fiscal de serviço fora do MVP.
- Preços provisórios até a decisão do dono antes do piloto.

## Fontes consultadas

- SDK Node.js oficial, versão 3.6.1, Node >= 18: https://www.npmjs.com/package/mercadopago/v/3.6.1
- Guia de validação de webhook do SDK: https://github.com/mercadopago/sdk-nodejs/blob/master/docs/webhooks.md
- Validador do `x-signature` (manifesto e comparação): https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts
- Assinaturas (`/preapproval`, campos e situações): https://github.com/mercadopago/sdk-nodejs/tree/master/src/clients/preApproval
- Cobranças da assinatura (`/authorized_payments` e busca): https://github.com/mercadopago/sdk-nodejs/tree/master/src/clients/invoice
- Base da API e `X-Idempotency-Key`: https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/config/index.ts
- Referência da API (não acessível desta sessão; conferir no sandbox): https://www.mercadopago.com.br/developers/pt/reference
- Webhooks (não acessível desta sessão; conferir no sandbox): https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
- Zod, `z.url` com `protocol` e `hostname`: https://zod.dev/api#urls
