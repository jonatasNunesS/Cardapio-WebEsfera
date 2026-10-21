# ADR 0006: Banco e isolamento entre restaurantes

- Situação: aceita (M02)
- Data: 2026-10-21

## Contexto

Isolamento entre restaurantes é a regra número um do produto (CLAUDE.md e
seção 5 do plano). O M02 é o portão: nenhuma regra de negócio começa antes de
o CI provar, contra um PostgreSQL real, que um restaurante não lê, não altera
e não grava dados de outro.

Os 5 arquivos de `docs/referencia/multitenancy` citados no prompt do M02 não
chegaram ao repositório. A lógica foi escrita a partir do prompt e da
documentação oficial abaixo.

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

Requisitos do prompt: SQL puro escrito à mão, numeração sequencial, uma
transação por migração, tabela de controle com checksum e linha de comando
no CI.

| Requisito                  | Drizzle Kit (`migrate`)                   | dbmate         | node-pg-migrate     | Migrador próprio |
| -------------------------- | ----------------------------------------- | -------------- | ------------------- | ---------------- |
| SQL puro                   | sim                                       | sim            | sim (também JS)     | sim              |
| Numeração sequencial       | não: ordena pelo timestamp do journal     | não: timestamp | timestamp ou número | sim, verificada  |
| Uma transação por migração | não: todas as pendentes numa transação só | sim            | sim                 | sim              |
| Checksum verificado        | grava o hash e nunca o confere            | não            | não                 | sim              |
| Migração sem transação     | não                                       | sim            | sim                 | sim              |

O comportamento do Drizzle Kit foi conferido no código instalado
(`drizzle-orm/pg-core/dialect.js`, método `migrate`): uma única
`session.transaction` para todas as migrações e comparação só por
`created_at`. Nenhuma alternativa atende o checksum, que é o requisito que
impede editar migração aplicada. O migrador e o leitor têm cerca de 250 linhas, em
`pacotes/infraestrutura/src/banco/migracoes`:

- Arquivos `banco/migracoes/NNNN_nome.sql`, de `0001` sem buracos.
- Tabela `migracoes.aplicadas (numero, nome, checksum sha256, aplicada_em)`.
- Trava `pg_advisory_lock` para dois deploys simultâneos.
- Antes de aplicar, confere o checksum de toda migração já aplicada; se mudou,
  para com `BANCO_MIGRACAO_ALTERADA`.
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

A lista fechada fica em `banco/tabelas-de-sistema.ts` e o teste 4 compara com
o catálogo.

| Tabela         | Permissões                                    | Motivo                                                   |
| -------------- | --------------------------------------------- | -------------------------------------------------------- |
| `caixa_saida`  | `SELECT`, `UPDATE (publicado_em, tentativas)` | O publicador do outbox lê os pendentes de todos e marca. |
| `sessoes_mesa` | `SELECT`, `UPDATE (fechada_em)`               | A rotina de expiração fecha as sessões vencidas.         |

Próximas, já combinadas: `eventos_pagamento`, `assinaturas` e `cobrancas`
(M10). Nunca `pedidos`, `itens_pedido`, `chamados` ou cardápio. Para agir num
restaurante específico, o worker usa `comRestaurante()`.

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
- Hoje, uma só: `app.resolver_mesa(p_slug, p_numero, p_codigo)`, que devolve
  `valida`, `redirecionar` ou `invalida`. No caso `invalida` com código
  existente, devolve `codigo_reconhecido = true`, sem ids, para o caso de uso
  do M08 registrar o alerta `MESA_RESOLUCAO_CODIGO_DIVERGENTE`.

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
- Manter o migrador é nosso. Ele é pequeno e tem testes; se o Drizzle Kit
  passar a verificar checksum e a usar uma transação por migração, vale
  reavaliar.
