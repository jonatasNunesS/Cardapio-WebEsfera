# ADR 0017: Intermediário, o essencial para o piloto

- Situação: proposta (intermediário, parte A)
- Data: 2026-10-31

## Contexto

O piloto precisa de tempo real e de uma fila para a equipe (parte A), e de um
admin mínimo (parte B), antes dos módulos completos M13 a M17. O trabalho vive
na branch `intermediario/essencial`, criada a partir da tag `base-intermediario`
na main. Os PRs vão contra essa branch, nunca contra a main.

Regras do John:

- banco só aditivo;
- migrações com prefixo `0900_intermediario_`;
- tabela nova pelo ADR 0006;
- código novo em pastas novas;
- contratos definitivos desde já: nomes de eventos, formatos em `contratos` e
  rotas `/api/v1`.

Pode ser simplificada a interface, nunca o contrato. Todo atalho provisório leva
o comentário `// INTERMEDIARIO:` e aparece na lista abaixo.

## Decisões

### Trilha de migrações à parte

O migrador da main exige numeração contígua e falha se houver linha aplicada
sem arquivo, de modo que um `0900` na pasta da main quebraria os dois lados.
Por isso as migrações do intermediário vivem numa trilha própria:

- pasta `banco/migracoes-intermediario/`;
- tabela de controle `migracoes.aplicadas_intermediario`;
- numeração começando em 900.

O migrador da main não vê essa trilha. `pnpm banco:migrar` roda a trilha
principal e depois a intermediária. O teste 16c prova que uma migração futura
da main roda sobre o banco já migrado pelo intermediário.

`0900_intermediario_fila.sql` é aditiva:

- coluna `pedidos.motivo_cancelamento` (de 3 a 200 caracteres), com
  `GRANT UPDATE` só nessa coluna;
- índices parciais de pedidos e chamados abertos.

### Fila da equipe

O módulo novo `equipe` cobre domínio, aplicação, repositório e rotas
`/api/v1/fila/...`.

- **Ordem das transições.** Avançar leva o pedido de `enviado` a `em_preparo`,
  depois a `pronto` e depois a `entregue`. O chamado vai de `aguardando` a
  `em_atendimento` e depois a `concluido`. O gatilho do banco continua valendo.
- **Situação esperada.** Toda ação manda a situação que a pessoa estava vendo.
  O repositório trava a linha com `FOR UPDATE`. Se a situação mudou, a resposta
  é 409 `EQUIPE_ACAO_SITUACAO_DESATUALIZADA` com `detalhes.situacaoAtual`.
  Assim, um clique duplo ou duas pessoas na mesma ação nunca corrompem o
  estado: o teste com oito avanços simultâneos tem um sucesso e sete 409.
- **Cancelamento pela equipe.** Exige motivo, vale até o pedido ser entregue e
  grava o motivo no pedido e na auditoria.
- **Auditoria.** Toda ação grava em `auditoria` (autor `usuario`) e no outbox,
  na mesma transação.
- **Encerrar a mesa.** Grava `fechada_em` e `motivo_fechamento = 'encerrada'`.
  Se houver pedido ou chamado em aberto e a pessoa ainda não confirmou, a
  resposta é 409 `EQUIPE_ENCERRAR_PENDENCIAS_ABERTAS` com as contagens. A sessão
  que só expirou continua `expirada`, e o cliente vê "escaneie".
- **Papéis.** Só dono e gerente usam a fila; outros papéis ficam fora do escopo.

### Eventos novos (contrato definitivo, versão 1)

| Evento                    | Campos                                                       |
| ------------------------- | ------------------------------------------------------------ |
| `PedidoSituacaoAlterada`  | `pedidoId`, `numero`, `mesaId`, `sessaoMesaId`, `de`, `para` |
| `ChamadoSituacaoAlterada` | `chamadoId`, `tipo`, `mesaId`, `sessaoMesaId`, `de`, `para`  |
| `SessaoMesaEncerrada`     | `sessaoMesaId`, `mesaId`                                     |

### Tempo real: pub/sub só avisa, quem recebe reconsulta

O caminho do evento é este:

1. O worker publica o outbox no canal Redis `r:<restaurante>:tempo-real`
   (M05).
2. A API mantém uma única conexão assinante. Cada canal tem uma contagem de
   referências, e cada mensagem é validada pelo contrato e descartada se o
   `restaurante_id` não for o do canal.
3. `GET /api/v1/tempo-real` serve o painel. Exige a sessão do painel e só
   assina o canal do restaurante da sessão.
4. `GET /api/v1/mesa/tempo-real` serve a mesa. Exige o cookie assinado da mesa,
   repassa só os eventos da própria `sessaoMesaId` e não envia dados, só o tipo.
5. Nenhuma rota recebe `restaurante_id` do cliente.

O fluxo começa com o evento `pronto` e manda um batimento a cada 25 s. O
cliente nunca aplica o evento como verdade: a cada evento e a cada `pronto`
(conexão e reconexão), ele reconsulta a fila ou o pedido. Se o Redis cair, o
assinante derruba todos os fluxos. O painel reconecta com backoff (1 s
dobrando até 30 s) e converge pela reconsulta (teste de API "o Redis cai").

### Cliente

O SSE da mesa fica no chunk preguiçoso do pedido e do atendimento. Até o
`pronto` chegar, e sempre que o SSE falhar, um polling de 10 s cobre a lacuna.
`SessaoMesaEncerrada` leva à tela de agradecimento.

### Tela Fila do painel

A tela tem:

- colunas de pedidos (enviado, em preparo, pronto, entregue nas últimas 3 h);
- chamados (aguardando, em atendimento, concluídos nas últimas 3 h);
- mesas abertas, com "Encerrar mesa".

Os alertas são o texto numa região `aria-live` e o destaque do item novo. O
som (WebAudio) é opcional e ligado por botão, porque o navegador exige um
gesto antes de tocar áudio.

## Atalhos provisórios (`// INTERMEDIARIO:`)

| Onde                                                              | O que é                                            | O que substitui                                                               | Como desligar                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pacotes/infraestrutura/src/banco/migracoes/migrador.ts`          | Trilha de migração 0900                            | Na fusão com a main, as migrações viram números contíguos da trilha principal | Renumerar, apagar `migracoes.aplicadas_intermediario` e remover a trilha |
| `scripts/banco-migrar.ts`                                         | Roda a trilha intermediária depois da principal    | Idem                                                                          | Remover a segunda chamada                                                |
| `pacotes/infraestrutura/src/banco/testes/migracoes.banco.test.ts` | Teste 16c da trilha                                | Idem                                                                          | Remover o bloco 16c                                                      |
| `pacotes/infraestrutura/src/banco/esquema/pedidos.ts`             | Coluna `motivoCancelamento` no Drizzle             | Fica no módulo completo                                                       | Nada a desligar: a coluna é definitiva                                   |
| `apps/api/src/identidade/registrar.ts`                            | Ponto único que registra as rotas do intermediário | Registro por módulo do M13                                                    | Não passar `intermediario` na composição                                 |
| `apps/api/src/composicao/intermediario.ts`                        | Composição da fila e do assinante                  | Composição por módulo do M13                                                  | Remover o arquivo e a chamada em `composicao/index.ts`                   |

Para desligar a parte A inteira sem mexer no banco, basta não passar
`intermediario` em `composicao/index.ts`: as rotas somem, e o cliente cai no
polling de 10 s, que só lê rotas que já existiam.

## Fora de escopo

- modo TV;
- push e PWA;
- papéis além de dono e gerente;
- relatórios.

## Consequências

- Cada API mantém uma conexão Redis a mais (assinante). Um fluxo SSE aberto
  segura um socket por aba.
- O proxy da frente precisa de `X-Accel-Buffering: no`, já enviado, e de um
  timeout de leitura acima de 25 s.
