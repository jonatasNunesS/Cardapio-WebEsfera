# M02: Banco de dados e isolamento entre restaurantes

## Contexto

M00 e M01 aceitos e na main: monorepo, fronteiras, CI, erros tipados,
`Resultado`, `ErroIsolamentoInquilino`, `reportarErro`, logger e Sentry.
Ainda não existe nenhuma tabela.

Este é o portão mais importante do projeto: nenhuma regra de negócio começa
antes de este módulo provar, por teste no CI, que um restaurante não lê,
não altera e não grava dados de outro.

Leia antes: CLAUDE.md; docs/adr/0002 e 0005; no plano, a seção 3
(modelagem), a seção 5 (segurança) e a subseção "Link e QR Code de cada
mesa" da seção 1; e os 5 arquivos de docs/referencia/multitenancy.
Os arquivos de referência mostram a lógica certa (RLS forçado, set_config
local à transação, falha fechada, chaves compostas), mas estão com nomes em
inglês e com `@sentry/nextjs`. Reescreva tudo em português, dentro da
arquitetura do projeto. Não copie.

## Objetivo

Banco pronto para todos os módulos seguintes, com quatro garantias provadas
por teste:

1. Toda tabela com `restaurante_id` tem RLS ligado, forçado e com política
   de leitura e de escrita.
2. O código da aplicação só toca dado de restaurante por `comRestaurante()`.
3. O único acesso que atravessa o isolamento é feito por funções
   privilegiadas de uma lista fechada, revisada e testada.
4. Uma tabela ou função nova que fuja dessas regras quebra o CI.

## Escopo

Dentro:

- Ferramenta de migrações e as migrações iniciais.
- Papéis do banco e permissões.
- As tabelas da lista abaixo, com o esquema Drizzle de cada uma.
- `comRestaurante()`, `comSistema()` e a conexão.
- A função de resolução da mesa (QR Code).
- Os testes de isolamento, de permissão e de funções privilegiadas.
- `/saude/pronto`, com checagem do banco.
- ADR 0006 e o runbook do banco.

Fora:

- Casos de uso e telas de mesas (M08). Aqui só a tabela, a função de
  resolução e o repositório mínimo para os testes.
- Usuários, login e personalização (M04).
- Assinaturas e cobranças (M10).
- Pedidos, chamados e cardápio: cada um entra no seu módulo, com a sua
  migração, e precisa passar nos testes deste módulo sem alteração.

## Antes de codar

Confira na documentação oficial, hoje, e cite as URLs no PR:

1. A versão do PostgreSQL que o M00 colocou no compose, e se ela tem
   `uuidv7()` nativo. O PostgreSQL 18 introduziu essa função; confirme na
   documentação. Se a versão não tiver, gere UUID v7 na aplicação.
2. Drizzle: o driver para PostgreSQL recomendado hoje, transações,
   `sql` cru e o suporte a migrações em SQL escrito à mão.
3. Ferramenta de migrações. Requisitos: SQL puro escrito à mão, numeração
   sequencial, uma transação por migração, tabela de controle com checksum
   e execução em linha de comando no CI. Compare o migrador do Drizzle Kit
   com uma alternativa (por exemplo, dbmate ou node-pg-migrate) e escolha.
   Registre a escolha no ADR 0006.
4. PostgreSQL: `CREATE POLICY` com `TO <papel>`, `FORCE ROW LEVEL
SECURITY`, `SECURITY DEFINER` com `SET search_path`, `set_config` com
   `is_local = true` e o comportamento de `current_setting(..., true)`.
   Se algo divergir deste prompt, siga a documentação e explique no PR.

## Papéis do banco

| Papel                              | Login | BYPASSRLS | Para quê                                                                                          |
| ---------------------------------- | ----- | --------- | ------------------------------------------------------------------------------------------------- |
| `cardapio_dono`                    | não   | não       | Dono de todas as tabelas e do esquema. Só as migrações agem como ele.                             |
| `cardapio_migracao`                | sim   | não       | Usuário do CI e do deploy, membro de `cardapio_dono`.                                             |
| `app_runtime`                      | não   | não       | Tudo o que a API e o worker fazem dentro de um restaurante.                                       |
| `app_sistema`                      | não   | não       | Rotinas do worker que atravessam restaurantes, só nas tabelas de sistema.                         |
| `funcoes_privilegiadas`            | não   | sim       | Dono das funções `SECURITY DEFINER`. Ninguém faz login com ele.                                   |
| `cardapio_api` e `cardapio_worker` | sim   | não       | Usuários de conexão. A API é membro de `app_runtime`; o worker, de `app_runtime` e `app_sistema`. |

Regras:

- As senhas dos usuários de login nunca ficam em migração. Em ambiente
  local, um script de inicialização do compose cria os usuários a partir do
  `.env`. Em produção, os passos ficam no runbook.
- Nenhuma tabela pertence a um usuário de login.
- O `app_sistema` só recebe permissão nas tabelas de sistema listadas no
  ADR 0006. Neste módulo, são `caixa_saida` (leitura e marcação de
  publicado) e `sessoes_mesa` (expirar sessões). Nunca recebe permissão em
  pedidos, itens de pedido, chamados ou cardápio, nem nos módulos futuros.
- Quando o worker precisar agir sobre um restaurante específico, ele usa
  `comRestaurante()`, como a API.

## Tabelas deste módulo

Nomes e colunas conforme a seção 3 do plano, em português, com UUID v7 e
datas em `timestamptz`.

| Tabela                   | RLS                                         | Observações                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `planos`                 | não (global, só leitura para `app_runtime`) | `codigo` único, `limite_mesas`, `mp_plano_id` anulável                                                                                                                                                                                                 |
| `restaurantes`           | sim, pela própria `id`                      | `slug` único e com formato `^[a-z0-9]+(-[a-z0-9]+)*$`; `situacao` com CHECK; `fuso_horario`                                                                                                                                                            |
| `historico_slugs`        | sim                                         | Slug antigo para redirecionamento. Um slug nunca pode voltar a ser usado por outro restaurante.                                                                                                                                                        |
| `mesas`                  | sim                                         | `numero` (1 a 999), `nome`, `area`, `codigo`, `ativa`, `codigo_gerado_em`. Únicos: `(restaurante_id, numero)` e `codigo`. CHECK de `codigo`: `^[A-Za-z0-9_-]{22}$`. O código é gerado na aplicação (16 bytes aleatórios em base64url), nunca no banco. |
| `historico_numeros_mesa` | sim                                         | Número antigo de cada mesa, para o link antigo redirecionar quando a mesa for renumerada.                                                                                                                                                              |
| `sessoes_mesa`           | sim                                         | Índice único parcial: uma sessão aberta por mesa. `expira_em` obrigatório.                                                                                                                                                                             |
| `caixa_saida`            | sim                                         | Outbox. `app_runtime` só insere no próprio restaurante. `app_sistema` lê e marca `publicado_em` de todos. Índice parcial em `publicado_em IS NULL`.                                                                                                    |
| `auditoria`              | sim                                         | Só inserção. `restaurante_id` anulável (ações da plataforma). `app_runtime` insere e lê só o próprio restaurante e nunca linhas com `restaurante_id` nulo. Particionamento por mês fica para quando houver volume; registre isso no ADR.               |

Regras de modelagem:

- Toda tabela de restaurante tem chave primária `(restaurante_id, id)` e
  toda FK entre tabelas de restaurante usa a chave composta.
- Toda política tem `USING` e `WITH CHECK`, e declara o papel (`TO`).
- A função `app.restaurante_atual()` lê `app.restaurante_id` com
  `current_setting(..., true)` e converte string vazia em NULL. Sem
  contexto, toda consulta devolve zero linhas (falha fechada).
- Toda migração começa com `SET lock_timeout` e `SET statement_timeout`.
- Índice novo em tabela que já tem dados é criado com `CONCURRENTLY`, numa
  migração sem transação. Documente como a ferramenta escolhida faz isso.

## Funções privilegiadas

- Ficam no esquema `app`, pertencem a `funcoes_privilegiadas`, usam
  `SECURITY DEFINER` com `SET search_path = pg_catalog, public`, têm
  `REVOKE ALL FROM PUBLIC` e `GRANT EXECUTE` só para o papel que precisa.
- Devolvem o mínimo: ids e situação, nunca linhas inteiras.
- A lista oficial fica em `banco/funcoes-privilegiadas.ts`: nome, papel que
  pode executar, motivo e ADR. Um teste compara essa lista com o catálogo
  do banco e falha se surgir uma função privilegiada fora da lista, ou se
  uma da lista sumir.
- Neste módulo, só uma: `app.resolver_mesa(slug text, numero int, codigo
text)`. Ela localiza a mesa pelo código e devolve uma de três respostas:
  - `valida`: `restaurante_id`, `mesa_id`, `slug_atual` e `numero_atual`,
    quando o código existe, a mesa está ativa, o restaurante não está
    cancelado e o slug e o número batem com os atuais.
  - `redirecionar`: os mesmos campos, quando o código é válido mas o slug
    ou o número vieram de `historico_slugs` ou `historico_numeros_mesa`.
  - `invalida`: nenhum id, em qualquer outro caso, inclusive quando o
    código existe mas o slug e o número não pertencem a ele.
    O caso `invalida` com código existente é registrado pela aplicação como
    alerta de segurança (pode ser alguém trocando números na URL).
- Os módulos futuros acrescentam as suas funções (login no M04, assinatura
  por id do Mercado Pago no M10, consultas do admin no M15) seguindo estas
  mesmas regras.

## Código na infraestrutura

- `pacotes/infraestrutura/src/banco/conexao.ts`: dois pools, `runtime`
  (usuário `cardapio_api` ou `cardapio_worker`) e `sistema` (só no worker),
  com limite de conexões e `statement_timeout`.
- `pacotes/infraestrutura/src/banco/com-restaurante.ts`:
  `comRestaurante(restauranteId, fn)`. Valida o UUID, abre uma transação,
  executa `set_config('app.restaurante_id', id, true)`, põe o
  `restauranteId` no contexto de observabilidade e chama `fn(tx)`. Se o
  banco responder 42501 (violação de RLS), lança
  `ErroIsolamentoInquilino` com o contexto completo, que vai ao Sentry como
  `fatal`.
- `comSistema(fn)`: o mesmo padrão, com o pool `sistema`, sem restaurante,
  e com a tag `contexto=sistema` no Sentry.
- `chaves-redis.ts`: a reescrita de `tenant-keys.ts` em português
  (`chavesRedis`). Só as funções, sem uso ainda.
- Esquema Drizzle de cada tabela em `pacotes/infraestrutura/src/banco/esquema`.
- Repositório mínimo de mesas, para os testes e o resolvedor:
  `resolverMesa(slug, numero, codigo)`.
- Regra de lint nova: fora de `pacotes/infraestrutura/src/banco`, ninguém
  importa o pool nem o driver. Isso obriga todo acesso a passar por
  `comRestaurante()` ou `comSistema()`.

## API

- `/saude` continua sem tocar no banco.
- `/saude/pronto` verifica o banco com uma consulta trivial e responde 503
  com Problem Details se falhar.

## Testes obrigatórios

Todos contra um PostgreSQL real (Testcontainers ou o compose do CI). Os
testes de isolamento conectam com os usuários de login reais, nunca com o
dono.

Catálogo (pegam erros de módulos futuros):

1. Toda tabela com coluna `restaurante_id` tem RLS ligado, forçado e pelo
   menos uma política com `USING` e `WITH CHECK`.
2. Nenhuma política dá `USING (true)` para `app_runtime`. Política
   `USING (true)` só é permitida para `app_sistema` nas tabelas de sistema
   do ADR 0006.
3. Os usuários de login e os papéis de aplicação não têm `BYPASSRLS` nem
   são superusuários, e nenhuma tabela pertence a eles.
4. O `app_sistema` não tem nenhuma permissão fora da lista de tabelas de
   sistema.
5. As funções `SECURITY DEFINER` do banco são exatamente as de
   `banco/funcoes-privilegiadas.ts`, e todas têm `search_path` fixo.
6. Toda tabela com `restaurante_id` tem uma fábrica de dados de teste
   registrada em `testes/fabricas`. Se não tiver, o teste falha com o nome
   da tabela, e quem criou a tabela precisa escrever a fábrica.

Acesso cruzado (genérico, roda em toda tabela registrada nas fábricas): 7. Com dados de A e de B, dentro de `comRestaurante(A)`:

- nenhuma linha de B aparece;
- `UPDATE` e `DELETE` em linhas de B afetam zero linhas;
- `INSERT` com `restaurante_id` de B falha com `ErroIsolamentoInquilino`.

8. Sem contexto (transação sem `set_config`), toda tabela devolve zero
   linhas.
9. Pool com uma conexão só: depois de uma transação de A, a transação
   seguinte sem contexto não enxerga A. O contexto não vaza entre
   transações.
10. Uma FK composta recusa uma sessão de A apontando para uma mesa de B.

Funções e regras: 11. `resolver_mesa`: - devolve `valida` com os ids certos; - devolve `invalida` para código inexistente, mesa inativa, restaurante
cancelado e código existente com número de outra mesa; - devolve `invalida` para código de A com o slug de B; - devolve `redirecionar` depois de renumerar a mesa e depois de trocar
o slug. 12. `comRestaurante` com UUID inválido falha antes de abrir a transação. 13. A violação de RLS chega ao relator de erros como `fatal`, com
`restaurante_id` e tabela no contexto. 14. Uma sessão aberta por mesa: a segunda abertura falha. 15. `app_runtime` não consegue ler auditoria com `restaurante_id` nulo. 16. As migrações rodam do zero, e rodar de novo não faz nada. Um teste
falha se o checksum de uma migração já aplicada mudar.

## Critério de pronto

- `pnpm verificar` verde, com os testes de banco rodando no CI contra
  PostgreSQL real.
- `pnpm banco:migrar` sobe o esquema do zero no compose.
- Demonstração no PR: a saída do teste 7 para cada tabela, e a saída do
  teste 6 falhando quando você cria uma tabela temporária com
  `restaurante_id` sem fábrica (mostre e depois remova).
- ADR 0006 e `docs/runbooks/banco.md` escritos.

## ADR 0006: Banco e isolamento

Registre: a ferramenta de migrações e o motivo; os papéis; as tabelas de
sistema do `app_sistema`; o processo para criar uma função privilegiada
nova (lista, motivo, revisão, teste); o padrão das políticas; a geração do
código da mesa na aplicação; e a regra para módulos futuros: toda tabela
nova com `restaurante_id` chega com política, fábrica de teste e passa nos
testes 1 a 8 sem mudar este módulo.

## Runbook do banco

Como criar os usuários de login em produção, como rodar migrações, como
reverter (expandir e contrair, nunca editar migração aplicada), como
restaurar um backup num ambiente separado e o que fazer quando o alerta de
`ErroIsolamentoInquilino` disparar.

## Proibido

- Usar `cardapio_dono` ou `cardapio_migracao` pela aplicação.
- `BYPASSRLS` em qualquer papel, menos `funcoes_privilegiadas`.
- Política sem `WITH CHECK`, ou sem `TO`.
- `restaurante_id` vindo de URL, query ou corpo.
- Gerar o código da mesa no banco.
- Desligar ou pular teste de isolamento, inclusive temporariamente.
- Emoji em qualquer lugar.

## Entrega

Branch da sessão, atualizada a partir da main. Commits por assunto:
migrações e papéis, tabelas e políticas, funções privilegiadas,
infraestrutura (conexão, comRestaurante, comSistema), testes de catálogo,
testes de acesso cruzado, API, docs. PR com título
`feat: banco e isolamento entre restaurantes (M02)` e descrição com: o que
foi criado; a ferramenta de migrações e o porquê; URLs consultadas; as
demonstrações do critério de pronto; riscos; e o que os próximos módulos
precisam seguir.
