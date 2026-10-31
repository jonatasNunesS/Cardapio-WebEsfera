# ADR 0017: Intermediário, o essencial para o piloto

- Situação: parte A aceita; parte B proposta
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

### Como a trilha intermediária entra na trilha da main

Quando o módulo completo correspondente (M13 a M17) chegar à main, a trilha
intermediária é absorvida em quatro passos, sem perder o banco do piloto.

1. **Migração equivalente e idempotente na main.** O módulo completo traz, na
   trilha principal e com o próximo número contíguo, uma migração que produz o
   mesmo resultado de cada `09NN` que ele substitui. Ela é escrita para não
   falhar onde o `09NN` já rodou:
   - `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` e
     `CREATE TABLE IF NOT EXISTS`;
   - `CREATE OR REPLACE FUNCTION`;
   - políticas e restrições nomeadas dentro de um bloco `DO` que consulta
     `pg_policies` e `pg_constraint` antes de criar;
   - `GRANT`, que já é idempotente.

   Num banco novo ela cria tudo; no banco do piloto ela não muda nada. Os
   nomes de colunas, índices, restrições e políticas do `09NN` são definitivos
   justamente para isso.

2. **Prova por catálogo.** Um teste de integração migra dois bancos: um só pela
   trilha principal nova, outro pela trilha principal antiga, depois a
   intermediária, depois a principal nova. Os dois catálogos têm de sair
   iguais: colunas, tipos, CHECKs, índices, políticas, `GRANT`s e funções.
3. **Fim da trilha.** No mesmo PR saem a pasta `banco/migracoes-intermediario/`,
   a segunda chamada em `scripts/banco-migrar.ts`, o teste 16c e os
   `// INTERMEDIARIO:` da trilha. Sem essa chamada, o migrador nunca mais lê
   `migracoes.aplicadas_intermediario`, e as linhas antigas sem arquivo deixam
   de importar.
4. **Limpeza do controle.** Uma migração seguinte da main confere que toda
   linha de `migracoes.aplicadas_intermediario` corresponde a um `09NN`
   incorporado e só então apaga a tabela. Se encontrar um nome desconhecido,
   falha e para a implantação.

Enquanto a incorporação não acontece, vale uma regra: nenhuma migração da
main altera o que um `09NN` criou. O teste 16c garante que a main continua
migrando sobre o banco do intermediário.

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

## Parte B: admin mínimo e entrada de restaurante

### Banco (`0901_intermediario_admin.sql`)

- `suspensoes_restaurante`: histórico de suspensões, com motivo, quem suspendeu,
  quando, e a reativação (motivo, quem, quando). Um índice único parcial deixa
  só uma suspensão aberta por restaurante.
- `convites`: o token é guardado só como hash SHA-256. Vale 72 h e é de uso
  único. Um convite novo invalida os abertos do mesmo dono.
- As duas tabelas seguem o ADR 0006: PK composta, RLS forçado, fábricas e os
  testes 1 a 8.
- As escritas do admin num restaurante passam por `comRestaurante()` com o id
  já resolvido; o admin nunca escreve fora do contexto.

Funções privilegiadas, todas na lista do teste 5, com
`search_path = pg_catalog, pg_temp`:

| Função                           | Para quê                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.admin_valido`               | Confere no banco o admin ativo e com segundo fator. Toda função do admin chama esta.                                                                                                       |
| `app.admin_listar_restaurantes`  | Lista os restaurantes, com a suspensão aberta.                                                                                                                                             |
| `app.admin_resolver_restaurante` | Traduz o slug da URL do admin no id do restaurante.                                                                                                                                        |
| `app.admin_criar_restaurante`    | Cria a conta do dono com hash de senha inutilizável, o restaurante do contexto, o slug e o vínculo, com auditoria. Personalização e convite entram na mesma transação, pelo `app_runtime`. |
| `app.admin_dono_do_restaurante`  | Nome e e-mail do dono, para reenviar o convite.                                                                                                                                            |
| `app.admin_indicadores`          | Contagens agregadas: restaurantes por situação e pedidos nas últimas 24 h.                                                                                                                 |
| `app.aceitar_convite`            | Consome o convite pelo hash, grava a senha, revoga as sessões e audita.                                                                                                                    |

### Ponto único de decisão

`podeReceberPedidos({ situacao, suspenso })` junta a régua de cobrança e a
suspensão aberta. O `CriarPedido` chama só ela. Suspenso segue a regra da
inadimplência: recusa pedidos, mas o cardápio fica no ar e chamar garçom e
pedir a conta continuam funcionando. Na lista do admin, a situação mostrada é
`suspenso` por cima da situação de cobrança; a coluna `restaurantes.situacao`
não muda.

### Convite

A porta `EnviadorConvite` recebe nome, e-mail, link e validade. O adaptador
manual devolve o link ao admin, que o vê uma vez e o repassa. Um provedor de
e-mail futuro é só um novo adaptador. O link leva o token depois de `#`, para
não entrar em logs de servidor nem em `Referer`. A tela `/convite` do painel
cria a senha, com as mesmas regras de senha nova (formato e lista de vazadas).

### Quem entra no admin

As rotas do admin exigem a sessão de admin completa: senha e segundo fator.
A sessão do dono do painel é outro cookie, de outro público, e recebe 401. No
host do painel, as rotas do admin nem existem (404).

### Link do Sentry

Vem da variável opcional `URL_SENTRY_DO_ADMIN`. Sem ela, a visão geral não
mostra o link.

## Atalhos provisórios (`// INTERMEDIARIO:`)

| Onde                                                               | O que é                                            | O que substitui                                                               | Como desligar                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pacotes/infraestrutura/src/banco/migracoes/migrador.ts`           | Trilha de migração 0900                            | Na fusão com a main, as migrações viram números contíguos da trilha principal | Renumerar, apagar `migracoes.aplicadas_intermediario` e remover a trilha |
| `scripts/banco-migrar.ts`                                          | Roda a trilha intermediária depois da principal    | Idem                                                                          | Remover a segunda chamada                                                |
| `pacotes/infraestrutura/src/banco/testes/migracoes.banco.test.ts`  | Teste 16c da trilha                                | Idem                                                                          | Remover o bloco 16c                                                      |
| `pacotes/infraestrutura/src/banco/esquema/pedidos.ts`              | Coluna `motivoCancelamento` no Drizzle             | Fica no módulo completo                                                       | Nada a desligar: a coluna é definitiva                                   |
| `apps/api/src/identidade/registrar.ts`                             | Ponto único que registra as rotas do intermediário | Registro por módulo do M13                                                    | Não passar `intermediario` na composição                                 |
| `apps/api/src/composicao/intermediario.ts`                         | Composição da fila, do assinante e do admin mínimo | Composição por módulo (M13 a M17)                                             | Remover o arquivo e a chamada em `composicao/index.ts`                   |
| `pacotes/infraestrutura/src/banco/esquema/intermediario.ts`        | Drizzle de `suspensoes_restaurante` e `convites`   | Fica no módulo completo                                                       | Nada a desligar: as tabelas são definitivas                              |
| `pacotes/aplicacao/src/pedidos/portas/repositorio-de-pedidos.ts`   | Campo `suspenso` no estado do pedido               | Fica: é a entrada de `podeReceberPedidos`                                     | Nada a desligar                                                          |
| `pacotes/infraestrutura/src/plataforma/enviador-convite-manual.ts` | Convite sem e-mail: o link volta ao admin uma vez  | Adaptador de e-mail da porta `EnviadorConvite`                                | Trocar o adaptador na composição                                         |
| `.github/workflows/ci.yml`                                         | Push em `intermediario/essencial` também roda o CI | Some com a branch                                                             | Tirar a branch da lista `push.branches`                                  |

Para desligar a parte B, retire `plataforma` de `comporIntermediario`: as rotas
do admin e do convite somem, e `podeReceberPedidos` continua valendo, porque
sem suspensão aberta ela é só a régua de cobrança.

Para desligar a parte A inteira sem mexer no banco, basta não passar
`intermediario` em `composicao/index.ts`: as rotas somem, e o cliente cai no
polling de 10 s, que só lê rotas que já existiam.

## Fora de escopo

- envio do convite por e-mail;
- busca e paginação na lista do admin (limite de 500);
- edição de dados do restaurante pelo admin;
- modo TV;
- push e PWA;
- papéis além de dono e gerente;
- relatórios.

## Consequências

- Cada API mantém uma conexão Redis a mais (assinante). Um fluxo SSE aberto
  segura um socket por aba.
- O proxy da frente precisa de `X-Accel-Buffering: no`, já enviado, e de um
  timeout de leitura acima de 25 s.
