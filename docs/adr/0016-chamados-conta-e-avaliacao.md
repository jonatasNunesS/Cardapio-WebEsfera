# ADR 0016: Chamados, conta e avaliação

- Situação: proposta (M12)
- Data: 2026-10-30

## Contexto

O M12 deixa o cliente chamar o garçom e pedir a conta com um toque, ver o
resumo da conta com taxa e divisão, e, ao fim da visita, ver o agradecimento
com "Avaliar no Google". A equipe ainda não vê os chamados em tempo real (M13).
As regras do prompt (`docs/prompts/m12-chamar-garcom-conta-e-avaliacao.md`)
valem como requisito.

Decisões do John antes de codar (2026-10-30):

1. Instagram: novo `link_instagram` na personalização, com campo no painel;
   sem link, o botão não aparece.
2. Fechamento: `sessoes_mesa.motivo_fechamento` (`expirada` ou `encerrada`);
   linhas antigas já fechadas entram como `expirada`. A rota da sessão só diz o
   estado da sessão do próprio cookie.
3. Conta: uma chamada só devolve subtotal, taxa, totais com e sem taxa e a
   tabela por pessoa de 1 a 20 nos dois casos. O cliente só escolhe o valor a
   exibir. A conta é buscada de novo ao abrir a tela ou quando um pedido muda.
4. Inadimplente ou fechado: chamar garçom e pedir conta continuam funcionando.

## Decisões

### Banco

Migração `0015_chamados_e_conta.sql`, pelo padrão do ADR 0006 (RLS forçado,
política `FOR ALL TO app_runtime`, fábrica, testes 1 a 8):

- `chamados`: tipo `garcom` ou `conta`; situação `aguardando`,
  `em_atendimento`, `concluido` ou `cancelado`; único por
  `(restaurante_id, chave_idempotencia)`; índice único parcial "um aberto
  (aguardando ou em atendimento) por tipo e sessão". O `app_runtime` só altera
  `situacao`, `assumido_por` e `atualizado_em`, e um gatilho recusa transição
  fora da ordem, como em `pedidos`.
- `sessoes_mesa.motivo_fechamento`, com `CHECK` de que ele existe se e só se
  `fechada_em` existe. A rotina de expiração e a reabertura de sessão vencida
  gravam `expirada`; o M13 gravará `encerrada`. O backfill desliga a RLS
  forçada só dentro da transação da migração, como no ADR 0014.
- `personalizacoes.link_instagram`: só `https://instagram.com/<perfil>` ou
  `https://www.instagram.com/<perfil>`, até 300 caracteres. A mesma regra vale
  no domínio e na tela do painel.

### Chamado: um toque basta

`ChamarGarcom` e `PedirConta` exigem `Idempotency-Key` (uuid v7). Numa
transação curta:

1. Sessão aberta e não vencida; senão, 401 com o caminho de escanear de novo.
2. Trava consultiva por sessão e tipo e outra pela chave: toques simultâneos,
   com chaves iguais ou diferentes, esperam um pelo outro.
3. A mesma chave devolve o mesmo chamado; um chamado aberto do mesmo tipo é
   devolvido sem criar outro (200). Só então grava o novo (201) e
   `ChamadoCriado` na outbox, na mesma transação.

O índice único parcial é a última barreira se alguém escapar das travas.
Garçom e conta convivem. Cancelar: só o cliente, só enquanto aguardando,
gravando `ChamadoCancelado`. Restaurante inadimplente ou fechado não bloqueia
chamado: a regra 8 suspende pedidos, e o cliente que já está na mesa precisa
poder chamar e pagar.

### Conta calculada no servidor

`GET /api/v1/mesa/conta` soma os pedidos não cancelados da sessão, com os
preços copiados no momento do pedido (ADR 0015), e devolve:

| Campo                                               | Regra                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `subtotalCentavos`                                  | soma dos `total_centavos` dos pedidos não cancelados             |
| `taxaCentavos`                                      | `floor((subtotal × 10 + 50) / 100)`: 10%, meio centavo para cima |
| `totalComTaxaCentavos` / `totalSemTaxaCentavos`     | subtotal com e sem a taxa                                        |
| `porPessoa.comTaxa[n-1]` / `porPessoa.semTaxa[n-1]` | `ceil(total / n)`, n de 1 a 20                                   |

A taxa é só exibição; a cobrança real é com o garçom. A divisão arredonda para
cima e mostra o total exato ao lado. O interruptor da taxa e o seletor de
pessoas só escolhem qual valor do servidor mostrar; nenhum total é calculado no
cliente.

### Sessão: aberta, encerrada ou expirada

`GET /api/v1/mesa/sessao` lê só a sessão do cookie assinado e devolve só
`{ situacao }`. Sem cookie, cookie inválido ou sessão de outro restaurante:
`expirada`. O app consulta a cada 30 s; com `encerrada`, mostra o
agradecimento. A sessão vencida por tempo continua na tela do M09 ("escaneie de
novo").

### Avaliação e Instagram

"Avaliar no Google" usa o `link_avaliacao_google` da personalização (M04) e
aparece para todos os clientes, sem filtro de satisfação (regra 9 e a política
do Google contra review gating). Abre em nova aba com `rel="noopener"`. Sem
link, o botão não aparece; o mesmo vale para "Seguir no Instagram".

### Cliente e orçamento de JavaScript

- As três telas (o que você precisa, conta, agradecimento) vão para um chunk
  sob demanda próprio, como o carrinho. No bundle inicial ficam o link no
  cabeçalho e a consulta da sessão a cada 30 s.
- Com dois chunks sob demanda compartilhando módulos, o empacotador dividiu a
  carga inicial em `index`, `react` e um chunk comum (sem mudar o total de
  forma relevante: +3,3 KB transferidos em relação ao M11).
- Achado do axe: a barra flutuante do pedido (M11) ficava fora de qualquer
  região; agora está num `<nav aria-label="Seu pedido">`.

| Medida (Lighthouse, 4G simulado, 3 execuções) | JS transferido                | LCP                      |
| --------------------------------------------- | ----------------------------- | ------------------------ |
| M11                                           | 114.861 / 114.861 / 114.861 B | 1.802 / 2.363 / 1.891 ms |
| M12                                           | 118.192 / 118.192 / 118.192 B | 1.726 / 2.173 / 2.332 ms |

## Consequências

- Um toque a mais, uma rede instável ou dois aparelhos na mesma mesa não criam
  chamado duplicado.
- O agradecimento só aparece de verdade quando o M13 encerrar a sessão; até lá,
  só os testes encerram (direto no banco).
- O cliente descobre o encerramento em até 30 s.
- A taxa de serviço exibida pode diferir do que o restaurante cobra; o texto
  diz que é opcional e que o pagamento é com o garçom.

## Fontes consultadas

- MDN, `rel="noopener"`: https://github.com/mdn/content/blob/main/files/en-us/web/html/reference/attributes/rel/noopener/index.md
- axe-core, regra `region` (conteúdo dentro de regiões): https://github.com/dequelabs/axe-core/blob/develop/lib/rules/region.json
- PostgreSQL, índices parciais: https://github.com/postgres/postgres/blob/master/doc/src/sgml/indices.sgml
- PostgreSQL, travas consultivas: https://github.com/postgres/postgres/blob/master/doc/src/sgml/mvcc.sgml
- Google, política contra seleção de avaliações (não acessível desta sessão; conferir antes do piloto): https://support.google.com/business/answer/7400114
