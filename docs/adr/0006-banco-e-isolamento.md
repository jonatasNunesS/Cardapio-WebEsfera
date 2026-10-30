# ADR 0006: Banco e isolamento entre restaurantes

- Situação: aceita (M02)
- Data: 2026-10-21

## Contexto

Isolamento entre restaurantes é a regra número um do produto (CLAUDE.md e
seção 5 do plano). O M02 é o portão: nenhuma regra de negócio começa antes de
o CI provar, contra um PostgreSQL real, que um restaurante não lê, não altera
e não grava dados de outro.

Os arquivos de `docs/referencia/multitenancy` citados no prompt do M02 não
chegaram ao repositório e deixaram de ser necessários (decisão do John em
2026-10-21). A lógica foi escrita a partir do prompt e da documentação
oficial abaixo.

| Componente         | Versão                                      |
| ------------------ | ------------------------------------------- |
| PostgreSQL         | 18.6 (`postgres:18.6-alpine3.23`)           |
| drizzle-orm        | 0.45.4 (estável; o site documenta a 1.0 RC) |
| pg (node-postgres) | 8.23.1                                      |

Documentação consultada (o site do PostgreSQL foi lido no código-fonte da
documentação, `doc/src/sgml` do ramo `REL_18_STABLE` em
https://github.com/postgres/postgres, porque parte dos sites não abre na rede
deste ambiente):

- `uuidv7()` nativo desde o 18: https://www.postgresql.org/docs/18/functions-uuid.html
- `CREATE POLICY` (`TO`, `USING`, `WITH CHECK`, política só de `INSERT` não
  aceita `USING`): https://www.postgresql.org/docs/18/sql-createpolicy.html
- RLS e `FORCE ROW LEVEL SECURITY`: https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- `SECURITY DEFINER` com `search_path` seguro ("Writing SECURITY DEFINER
  Functions Safely"): https://www.postgresql.org/docs/18/sql-createfunction.html
- `set_config(..., true)` e `current_setting(..., true)`: https://www.postgresql.org/docs/18/functions-admin.html
- `GRANT ... WITH INHERIT / SET`: https://www.postgresql.org/docs/18/sql-grant.html
- `CREATE INDEX CONCURRENTLY` fora de transação: https://www.postgresql.org/docs/18/sql-createindex.html
- Drizzle com node-postgres, transações, `sql` e migrações:
  https://orm.drizzle.team/docs/get-started-postgresql,
  https://orm.drizzle.team/docs/transactions, https://orm.drizzle.team/docs/sql,
  https://orm.drizzle.team/docs/migrations (lidos em
  https://github.com/drizzle-team/drizzle-orm-docs)
- Evento `error` do pool: https://node-postgres.com/apis/pool
- Scripts de inicialização da imagem oficial: https://hub.docker.com/_/postgres

## Decisões

### Ferramenta de migrações: migrador próprio

**Não troque o migrador sem reler esta seção.** Ele parece reinventar a roda,
mas as três ferramentas avaliadas falham num requisito que protege o
isolamento: impedir que uma migração já aplicada seja editada em silêncio.
Uma política de RLS alterada no arquivo, depois de aplicada, deixaria o
repositório e o banco dizendo coisas diferentes, e nenhum teste veria.

Requisitos (prompt do M02): SQL puro escrito à mão, numeração sequencial, uma
transação por migração, tabela de controle com checksum, trava contra duas
instâncias e linha de comando no CI.

| Requisito                  | Drizzle Kit (`migrate`)                   | dbmate                               | node-pg-migrate            | Migrador próprio |
| -------------------------- | ----------------------------------------- | ------------------------------------ | -------------------------- | ---------------- |
| SQL puro                   | sim                                       | sim                                  | sim (também JS)            | sim              |
| Numeração sequencial       | não: ordena pelo timestamp do journal     | não: timestamp, aceita fora de ordem | timestamp; confere a ordem | sim, verificada  |
| Uma transação por migração | não: todas as pendentes numa transação só | sim                                  | sim (ou uma só, com opção) | sim              |
| Checksum verificado        | grava o hash e nunca o confere            | não: grava só a versão               | não: grava só nome e data  | sim              |
| Migração sem transação     | não                                       | sim (`transaction:false`)            | sim                        | sim              |
| Trava entre instâncias     | não                                       | sim, com `--migration-lock`          | sim (`pg_advisory_lock`)   | sim              |

O que foi visto em cada uma, em 2026-10-21:

- **Drizzle Kit** (drizzle-orm 0.45.4, código instalado em
  `drizzle-orm/pg-core/dialect.js`, método `migrate`): uma única
  `session.transaction` envolve todas as migrações pendentes, então uma falha
  na quinta desfaz as quatro anteriores e `CREATE INDEX CONCURRENTLY` é
  impossível. A tabela `__drizzle_migrations (id, hash, created_at)` guarda o
  hash, mas a decisão de aplicar compara só `created_at` com o
  `folderMillis` do journal: arquivo editado depois de aplicado passa sem
  aviso. Não há trava.
- **dbmate** (README do ramo `main` em https://github.com/amacneil/dbmate): a tabela
  `schema_migrations` tem só `version`. O README diz que "dbmate only stores
  the version number, not the contents" e que aplica migração com versão
  menor que as já aplicadas sem reclamar. Tem `transaction:false` por arquivo
  e `--migration-lock`. Seria a melhor alternativa se o checksum não fosse
  requisito.
- **node-pg-migrate** (`src/runner.ts` do ramo `main`, versão 10.0.0-alpha.6, em
  https://github.com/salsita/node-pg-migrate): a tabela `pgmigrations` tem
  `id`, `name` e `run_on`; não guarda conteúdo nem hash. Confere a ordem
  (`checkOrder`) e usa `pg_advisory_lock`. É feito para migrações em
  JavaScript; SQL puro é o caso secundário.

Reavalie quando uma delas passar a recusar migração aplicada com conteúdo
alterado. Até lá, o custo do migrador próprio é pequeno: cerca de 250 linhas
com o leitor, em `pacotes/infraestrutura/src/banco/migracoes`, cobertas pelos
testes 16 e 16b.

Como funciona:

- Arquivos `banco/migracoes/NNNN_nome.sql`, de `0001` sem buracos.
- Tabela `migracoes.aplicadas (numero, nome, checksum sha256, aplicada_em)`.
- Trava `pg_advisory_lock` de sessão, tomada antes de qualquer comando, até
  antes de criar a tabela de controle. Uma segunda instância espera; quando
  entra, não encontra nada pendente e sai sem erro (teste 16b). Sem a trava,
  as duas colidem já no `CREATE SCHEMA`, o que foi conferido tirando a trava
  e rodando o teste. Se a conexão cair, o PostgreSQL solta a trava sozinho.
  A trava é de sessão, não `pg_advisory_xact_lock`, porque precisa durar
  entre as várias transações de uma execução.
- Antes de aplicar, confere o checksum de toda migração já aplicada; se mudou
  ou sumiu, para com `BANCO_MIGRACAO_ALTERADA`.
- Cada migração roda na sua transação, como `cardapio_dono` (`SET ROLE`). Se
  falhar, faz rollback e para com `BANCO_MIGRACAO_INVALIDA`, com o nome do
  arquivo.
- Toda migração começa com `SET LOCAL lock_timeout` e `SET LOCAL
statement_timeout`; o leitor recusa arquivo sem esse cabeçalho.
- Migração sem transação: primeira linha `-- cardapio:sem-transacao`, com
  `SET` (sem `LOCAL`) no cabeçalho e os passos separados por
  `-- cardapio:passo`. Cada passo roda sozinho, como exige `CREATE INDEX
CONCURRENTLY`. Use `IF NOT EXISTS` para o passo poder ser repetido se o
  deploy cair no meio. O teste 16 cobre esse caminho.
- Linha de comando: `pnpm banco:migrar`, com `URL_BANCO_MIGRACAO`.

### Papéis

| Papel                             | Login | BYPASSRLS | Uso                                                                             |
| --------------------------------- | ----- | --------- | ------------------------------------------------------------------------------- |
| `cardapio_dono`                   | não   | não       | Dono do esquema e das tabelas. Só as migrações agem como ele.                   |
| `cardapio_migracao`               | sim   | não       | Usuário do CI e do deploy. Membro de `cardapio_dono`.                           |
| `app_runtime`                     | não   | não       | Tudo o que a API e o worker fazem dentro de um restaurante.                     |
| `app_sistema`                     | não   | não       | Rotinas do worker que atravessam restaurantes, só nas tabelas de sistema.       |
| `funcoes_privilegiadas`           | não   | sim       | Dono das funções `SECURITY DEFINER`. Ninguém faz login com ele.                 |
| `cardapio_api`, `cardapio_worker` | sim   | não       | Usuários de conexão. API: `app_runtime`. Worker: `app_runtime` e `app_sistema`. |

- `banco/papeis.sql` cria os papéis sem login. Roda com um administrador,
  nunca pelas migrações, porque `BYPASSRLS` exige superusuário.
  `banco/usuarios.sql` cria os usuários de login com as senhas recebidas por
  variável do psql. Senha nunca fica em migração.
- O worker é membro de `app_sistema` com `INHERIT FALSE, SET TRUE`: a conexão
  age como `app_runtime` e só vira `app_sistema` dentro de `comSistema()`, com
  `SET LOCAL ROLE app_sistema`, que acaba com a transação. Sem isso, as
  políticas de `app_sistema` valeriam em toda transação do worker.
- `cardapio_dono` é membro de `funcoes_privilegiadas` com `INHERIT FALSE, SET
TRUE`, só para a migração poder fazer `ALTER FUNCTION ... OWNER TO
funcoes_privilegiadas`. Quem tem `cardapio_migracao` já pode tudo nas
  tabelas, então isso não abre nada novo; por isso a senha dela fica só no CI
  e no deploy.
- Nenhum papel de aplicação tem `CREATE` em esquema nem é dono de tabela.

### Tabelas de sistema do `app_sistema`

A lista fechada fica em `banco/tabelas-de-sistema.ts`. O teste 4 confere que
o `app_sistema` só tem permissão nessas tabelas, e o teste 4b (desde o M05)
confere que as permissões são exatamente as da lista, nem uma a mais.

**Regra: o `app_sistema` só recebe a permissão que usa.** Permissão concedida
"para depois" ou que perdeu o uso é revogada por migração, e a lista e o teste
4b mudam junto. Quem precisar de uma permissão nova justifica no ADR do módulo.

| Tabela              | Permissões                                                                              | Motivo                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `caixa_saida`       | `SELECT`, `UPDATE (publicado_em, tentativas)`                                           | O publicador do outbox lê os pendentes de todos e marca.                                            |
| `sessoes_mesa`      | `SELECT`                                                                                | A rotina de expiração lista as vencidas de todos; o fechamento é por `comRestaurante()`.            |
| `eventos_pagamento` | `SELECT`, `UPDATE (em_processamento_em, processado_em, tentativas, ultimo_erro_codigo)` | O aviso do Mercado Pago chega sem restaurante; o worker lê e marca o processamento (M10, ADR 0014). |

Histórico: o M02 concedeu `UPDATE (fechada_em)` em `sessoes_mesa` para a
rotina de expiração. No M05 o fechamento e o evento `SessaoMesaExpirada` na
outbox passaram a acontecer por restaurante, com `comRestaurante()`, na mesma
transação (decisão do John, ADR 0009), e a permissão ficou sem uso. A migração
`0008_revogar_update_de_sistema_em_sessoes_mesa.sql` a revogou. A política
`sessoes_mesa_sistema` continua `FOR ALL`: o teste 1b exige `USING` e
`WITH CHECK` em toda política, e quem limita o que o papel faz é a permissão.

O M10 somou só `eventos_pagamento`. `assinaturas` e `cobrancas`, que estavam
previstas aqui, não foram precisas: a rotina lista ids por
`app.listar_restaurantes_para_cobranca` e lê cada restaurante com
`comRestaurante()` (ADR 0014). Nunca `pedidos`, `itens_pedido`, `chamados` ou
cardápio. Para agir num restaurante específico, o worker usa
`comRestaurante()`.

### Padrão das tabelas e políticas

- Toda tabela de restaurante tem PK `(restaurante_id, id)`, com `id uuid
DEFAULT uuidv7()`, e toda FK entre tabelas de restaurante usa a chave
  composta. Exceção: `auditoria` tem PK `(id)`, porque `restaurante_id` é
  anulável (ações da plataforma) e coluna de PK não aceita nulo.
- `ENABLE` e `FORCE ROW LEVEL SECURITY` em toda tabela com `restaurante_id`
  (e em `restaurantes`, pela própria `id`).
- Toda política é `FOR ALL TO <papel> USING (...) WITH CHECK (...)`, com
  `restaurante_id = app.restaurante_atual()`. O PostgreSQL não aceita `USING`
  em política só de `INSERT`; por isso "só insere" é garantido pelo `GRANT`
  (ex.: `caixa_saida` tem só `INSERT` para `app_runtime`), não pela política.
- `app.restaurante_atual()` é `nullif(current_setting('app.restaurante_id',
true), '')::uuid`. Sem contexto, ou depois do fim da transação (quando
  `current_setting` devolve string vazia), o resultado é nulo e toda
  consulta volta vazia: falha fechada.
- `USING (true)` só para `app_sistema`, só nas tabelas de sistema (teste 2).
- `historico_slugs` guarda todo slug que o restaurante já usou, inclusive o
  atual, com `UNIQUE (slug)` global: um slug nunca volta para outro
  restaurante. Um gatilho de restrição adiado exige que o slug atual de
  `restaurantes` esteja no histórico ao fim da transação.
- `auditoria`: só `SELECT` e `INSERT` para `app_runtime`; linhas com
  `restaurante_id` nulo não aparecem para ninguém da aplicação.
  Particionamento por mês fica para quando houver volume.

### Funções privilegiadas

- Esquema `app`, dono `funcoes_privilegiadas`, `SECURITY DEFINER`, `SET
search_path = pg_catalog, pg_temp`, `REVOKE ALL FROM PUBLIC` e `GRANT
EXECUTE` só ao papel que precisa. Devolvem só ids e situação.
- Divergência do prompt: o prompt pede `pg_catalog, public`. A documentação
  manda pôr `pg_temp` por último de forma explícita, porque, se ele não
  aparece, é pesquisado primeiro e qualquer um com `TEMP` poderia sombrear
  uma tabela. As funções usam nomes qualificados (`public.mesas`), então
  `public` não precisa estar no caminho.
- `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` na
  migração 0001: função nova nasce sem execução pública.
- Lista oficial em `banco/funcoes-privilegiadas.ts`. O teste 5 falha se surgir
  função `SECURITY DEFINER` fora da lista, se uma sumir, se o `search_path`
  não for fixo ou se outro papel puder executar.
- A primeira foi `app.resolver_mesa(p_slug, p_numero, p_codigo)`. O M08 a
  refez (ADR 0012): ela acha a mesa só pelo código e devolve `situacao` entre
  `valida`, `redirecionar`, `inativa`, `cancelado` e `desconhecido`, com
  `slug_atual` e `numero_atual` para o redirecionamento. O M04 somou as
  funções de identidade, o M06 somou `app.resolver_cardapio(p_slug)`, que
  resolve o slug público do cardápio (ADR 0010), e o M08 somou
  `app.admin_listar_mesas(p_administrador_id, p_slug)`, a leitura somente
  leitura das mesas pelo admin, que grava a consulta na auditoria. O M10
  somou `app.registrar_evento_pagamento` (`app_runtime`: o aviso do Mercado
  Pago grava o evento antes de existir restaurante) e
  `app.listar_restaurantes_para_cobranca` (`app_sistema`: só ids, em
  páginas, para as rotinas diárias), as duas no ADR 0014.

Processo para criar uma função privilegiada nova:

1. Justificar no PR por que não dá para fazer com `comRestaurante()`.
2. Escrever a migração com o padrão acima e devolver o mínimo.
3. Acrescentar a função em `banco/funcoes-privilegiadas.ts`, com papel,
   motivo e este ADR (ou o ADR do módulo).
4. Escrever testes do caminho feliz, de cada recusa e de que ela não devolve
   dado de outro restaurante.
5. Revisão do John antes do merge.

### Código na infraestrutura

- `conexao.ts`: pool com `max`, `statement_timeout` de 5 s e
  `connectionTimeoutMillis` de 3 s. O evento `error` do pool (conexão ociosa
  que cai) vai ao `RelatorDeErros` como `ErroDependenciaExterna`. Sem
  ouvinte, o Node encerra o processo; a prova de ponta a ponta derrubou a API
  assim e o teste `conexao.banco.test.ts` cobre o caso.
- `com-restaurante.ts`: valida o UUID antes de abrir a transação, abre a
  transação, faz `set_config('app.restaurante_id', id, true)` e roda a
  operação dentro do contexto de observabilidade com o `restauranteId`.
- `com-sistema.ts`: pool `sistema` (só o worker), `SET LOCAL ROLE
app_sistema` e a tag `contexto=sistema`.
- `semRestaurante(casoDeUso, fn)`: transação como `app_runtime` sem
  contexto. Serve só para chamar função privilegiada e para a checagem de
  prontidão; qualquer tabela de restaurante devolve zero linhas.
- O contexto de observabilidade chega pela porta `PropagadorDeContexto`
  (aplicação), implementada em `@cardapio/observabilidade/node`, porque a
  infraestrutura não importa a observabilidade (ADR 0002).
- Erros: SQLSTATE `42501` vira `ErroIsolamentoInquilino`
  (`BANCO_ISOLAMENTO_VIOLADO`, nível `fatal`) com o restaurante e a tabela;
  falha de conexão ou autenticação vira `ErroDependenciaExterna`
  (`BANCO_CONEXAO_FALHOU`); o resto vira `ErroAplicacao`
  (`BANCO_CONSULTA_FALHOU`). A causa guardada é o erro do driver, nunca o
  `DrizzleQueryError`, que carrega os parâmetros da consulta.
- Código da mesa: `randomBytes(16).toString('base64url')` na aplicação (22
  caracteres), nunca no banco. O banco só confere o formato.
- Regra de lint: fora de `pacotes/infraestrutura/src/banco`, ninguém importa
  `pg` ou `drizzle-orm` (elemento `banco` no ADR 0002).

### API

- `/saude` não toca o banco. `/saude/pronto` roda `SELECT 1` e, se o banco
  não responde, o tratador global transforma o `ErroDependenciaExterna` em
  503 Problem Details (`HTTP_DEPENDENCIA_INDISPONIVEL`) e reporta ao Sentry.
- O healthcheck do compose usa `/saude/pronto`.

### Testes

- Rodam contra PostgreSQL real: o serviço `postgres` do job de verificação no
  CI e o compose local. Não usamos Testcontainers: o CI já tem o serviço, e a
  imagem é a mesma do compose.
- O `globalSetup` do projeto `banco` do Vitest cria um banco novo, roda
  `papeis.sql`, cria os usuários, aplica as migrações e apaga o banco no fim.
  Os testes conectam como `cardapio_api` e `cardapio_worker`, nunca como dono.
- A infraestrutura de teste fica em `pacotes/infraestrutura/src/banco/testes`
  (o prompt fala em `testes/fabricas` na raiz), para respeitar a regra de
  lint do driver.
- O teste 7 olha os `GRANT` de cada tabela: onde `app_runtime` não tem o
  comando, espera a recusa do banco, que também vira `ErroIsolamentoInquilino`.
- O teste 3b percorre `pg_auth_members` de forma recursiva e confere com
  `pg_has_role(..., 'MEMBER')`: `cardapio_api` só herda `app_runtime`,
  `cardapio_worker` só `app_runtime` e `app_sistema`, e nenhum dos dois é
  membro, direto ou indireto, de `cardapio_dono`, `cardapio_migracao` ou
  `funcoes_privilegiadas`. Conferido dando `cardapio_dono` a `app_runtime`:
  o teste falha e acusa também o `funcoes_privilegiadas`, herdado através do dono.

## Identidade (M04)

Migrações `0006_identidade` e `0007_personalizacao_e_horarios`.

### Tabelas que só as funções privilegiadas alcançam

`usuarios`, `administradores`, `codigos_recuperacao_admin`, `sessoes`,
`tokens_redefinicao_senha` e `tentativas_login` não têm `restaurante_id`. O
`app_runtime` e o `app_sistema` não têm permissão nenhuma nelas (teste 7 do
catálogo, um por tabela); só o `funcoes_privilegiadas` tem, e só os comandos
que as funções usam. Ler `usuarios`, `sessoes`, `administradores` ou
`tentativas_login` direto com o usuário da API ou do worker falha com
`ErroIsolamentoInquilino`, com ou sem restaurante no contexto (teste 10 do
isolamento).

`vinculos`, `personalizacoes` e `horarios` têm `restaurante_id` e seguem o
padrão: PK composta, RLS forçado, política para `app_runtime` e fábrica.
Passaram nos testes 1 a 8 sem mudança no módulo.

Ninguém da aplicação cria administrador. `pnpm admin:criar` usa a credencial
das migrações, como `pnpm banco:migrar` (ADR 0008).

### As 19 funções novas

Uma função por operação, todas na lista de `banco/funcoes-privilegiadas.ts`,
com `search_path` fixo, dono `funcoes_privilegiadas` e execução só para
`app_runtime` (teste 5). Cada uma devolve o mínimo: id, hash ou um booleano.

| Função                                | Por que precisa passar por cima do RLS                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app.criar_usuario`                   | `usuarios` não é de restaurante. Devolve o id, ou nulo se o e-mail existe.                                                 |
| `app.buscar_credenciais`              | Login antes de existir restaurante no contexto. Devolve id e hash da senha.                                                |
| `app.listar_vinculos`                 | Descobrir em que restaurantes o usuário entra, antes de existir restaurante no contexto. Devolve `restaurante_id` e papel. |
| `app.criar_sessao`                    | `sessoes` não é de restaurante. Confere o vínculo com o restaurante (painel) ou se o admin está ativo.                     |
| `app.buscar_sessao`                   | Validar o cookie em toda requisição. Devolve titular, restaurante, papel (do vínculo) e datas de uma sessão não revogada.  |
| `app.renovar_sessao`                  | Marcar o último uso.                                                                                                       |
| `app.revogar_sessao`                  | Sair.                                                                                                                      |
| `app.definir_restaurante_da_sessao`   | Apontar a sessão para o restaurante recém-criado; só com vínculo.                                                          |
| `app.criar_token_redefinicao`         | Grava o resumo do token e invalida os anteriores. Devolve só se o e-mail existe; a API responde igual nos dois casos.      |
| `app.redefinir_senha`                 | Consome o token, troca a senha e revoga as sessões, numa transação.                                                        |
| `app.buscar_admin`                    | Login do admin. Devolve id, hash e se falta trocar a senha ou cadastrar o segundo fator.                                   |
| `app.buscar_segundo_fator_admin`      | Conferir o código. Devolve o segredo cifrado e o último passo usado.                                                       |
| `app.iniciar_cadastro_segundo_fator`  | Guarda o segredo novo, cifrado, como pendente. Só com troca de senha pendente.                                             |
| `app.concluir_cadastro_segundo_fator` | Ativa o segredo, troca a senha, grava os resumos dos códigos de recuperação e revoga as sessões, numa transação.           |
| `app.usar_passo_totp`                 | Anti-reuso: só aceita passo maior que o último, numa atualização atômica.                                                  |
| `app.usar_codigo_recuperacao`         | Consome um código de recuperação uma vez só.                                                                               |
| `app.registrar_falha_login`           | Bloqueio progressivo por alvo (resumo do e-mail ou do IP). Devolve o total.                                                |
| `app.consultar_tentativas_login`      | Ler as falhas do e-mail e do IP antes de conferir a senha.                                                                 |
| `app.limpar_tentativas_login`         | Zerar as falhas do e-mail depois de um login certo.                                                                        |

Criar restaurante não precisou de função: a aplicação gera o id, abre
`comRestaurante(id)` e grava o restaurante, o slug no histórico, o vínculo
do dono e a personalização padrão, com `app_runtime`. O slug ocupado por
outro restaurante (em `restaurantes` ou em `historico_slugs`) é detectado pela
violação de unicidade dentro de um ponto de salvamento, e o próximo candidato
é tentado.

## Regra para os módulos futuros

Toda tabela nova com `restaurante_id`:

1. Chega numa migração nova (nunca edite uma aplicada), com PK composta, RLS
   ligado e forçado, política `FOR ALL TO app_runtime` com `USING` e `WITH
CHECK`, e `GRANT` só dos comandos necessários.
2. Tem esquema Drizzle em `pacotes/infraestrutura/src/banco/esquema` e fábrica
   em `pacotes/infraestrutura/src/banco/testes/fabricas`.
3. Passa nos testes 1 a 8 sem mudar este módulo. Tabela sem fábrica, sem
   esquema Drizzle ou sem política quebra o CI.
4. Se o `app_sistema` precisar dela, entra em `banco/tabelas-de-sistema.ts`
   com motivo, e este ADR é atualizado.

## Consequências

- Esquecer `comRestaurante()` não vaza dado: sem contexto, nada aparece.
- Toda rotina do worker que atravessa restaurantes fica limitada pelo banco às
  tabelas de sistema, não por disciplina.
- Manter o migrador é nosso. Ele é pequeno e tem testes; o critério para
  trocá-lo está na seção da ferramenta de migrações.
