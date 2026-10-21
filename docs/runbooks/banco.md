# Runbook: banco de dados

Decisões e motivos no [ADR 0006](../adr/0006-banco-e-isolamento.md). Aqui
ficam os passos.

## Ambiente local

```sh
cp .env.exemplo .env
docker compose up --build --wait
curl http://127.0.0.1:3000/saude/pronto   # {"situacao":"pronto"}
```

- O Postgres roda `banco/inicializacao/01-papeis-e-usuarios.sh` só quando o
  volume está vazio. Ele cria os papéis (`banco/papeis.sql`) e os usuários de
  login (`banco/usuarios.sql`) com as senhas `SENHA_BANCO_*` do `.env`.
- O serviço `migracoes` roda `pnpm banco:migrar` (no contêiner, `node
scripts/banco-migrar.ts`) e termina. A API e o worker só sobem depois dele.
- Volume criado antes do M02 não tem os papéis. Recrie com
  `docker compose down --volumes` (apaga os dados locais).
- Para migrar do host: `URL_BANCO_MIGRACAO=postgres://cardapio_migracao:migracao_local@127.0.0.1:5432/cardapio pnpm banco:migrar`.
- Testes de banco: `pnpm testes` (projeto `banco` do Vitest). Eles criam e
  apagam um banco próprio com o administrador de `URL_BANCO_TESTE_ADMIN`
  (padrão: o superusuário `cardapio` do compose, banco `postgres`).

## Criar papéis e usuários em produção

Uma vez por banco, com um administrador (no provedor gerenciado, o usuário
administrativo que ele entrega), numa sessão `psql` sem histórico:

1. Gerar três senhas fortes e guardar no cofre de segredos:
   `cardapio_migracao`, `cardapio_api` e `cardapio_worker`.
2. Rodar os papéis:
   `psql "$URL_ADMIN" -v ON_ERROR_STOP=1 -f banco/papeis.sql`
3. Rodar os usuários, passando as senhas por variável, nunca no arquivo:
   ```sh
   psql "$URL_ADMIN" -v ON_ERROR_STOP=1 \
     -v senha_migracao="$SENHA_MIGRACAO" \
     -v senha_api="$SENHA_API" \
     -v senha_worker="$SENHA_WORKER" \
     -f banco/usuarios.sql
   ```
4. Cadastrar as URLs: `URL_BANCO_MIGRACAO` só no CI e no passo de deploy;
   `URL_BANCO_API` na API; `URL_BANCO_WORKER` no worker. Use `sslmode=require`
   na URL.
5. Conferir: `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE
rolname LIKE 'cardapio%' OR rolname LIKE 'app_%' OR rolname =
'funcoes_privilegiadas';` Só `funcoes_privilegiadas` pode ter
   `rolbypassrls = true`, e ninguém `rolsuper`.

Os dois scripts são idempotentes. Para trocar uma senha, rode o passo 3 de
novo e atualize o segredo; as conexões abertas continuam até reconectar.

Se o provedor não deixar criar papel com `BYPASSRLS`, pare: sem ele a
`app.resolver_mesa` não enxerga as mesas. Fale com o John antes de qualquer
alternativa.

## Rodar migrações

- No deploy, antes de subir a versão nova: `pnpm banco:migrar` com
  `URL_BANCO_MIGRACAO`. A trava do migrador impede dois deploys juntos.
- A saída lista as migrações aplicadas. Se uma falhar, ela é desfeita
  inteira, o erro nomeia o arquivo e as anteriores continuam aplicadas.
- `BANCO_MIGRACAO_ALTERADA`: alguém editou uma migração já aplicada. Não
  edite o banco para "consertar" o checksum; volte o arquivo ao original e
  crie uma migração nova.

### Escrever uma migração

- Arquivo `banco/migracoes/NNNN_nome.sql`, próximo número, sem buraco.
- Primeiras linhas:
  ```sql
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '60s';
  ```
- Índice em tabela com dados: migração própria, sem transação.
  ```sql
  -- cardapio:sem-transacao
  SET lock_timeout = '5s';
  SET statement_timeout = '0';
  -- cardapio:passo
  CREATE INDEX CONCURRENTLY IF NOT EXISTS pedidos_criado_em_idx ON public.pedidos (criado_em);
  ```
  Se o passo falhar no meio, o índice pode ficar `INVALID`: apague com
  `DROP INDEX CONCURRENTLY` numa migração nova e crie de novo.
- Tabela de restaurante: siga a "Regra para os módulos futuros" do ADR 0006.

## Reverter

Nunca edite nem apague migração aplicada. Reverter é expandir e contrair:

1. Expandir: migração que acrescenta o novo (coluna, tabela, índice) sem
   tirar o antigo. A versão atual e a nova funcionam com o esquema.
2. Publicar o código que usa o novo.
3. Contrair: numa entrega seguinte, migração que remove o antigo.

Para voltar a imagem anterior (rollback em até 5 minutos, seção 10 do plano),
o esquema precisa continuar compatível com ela. Por isso o passo 3 só vem
depois de a versão nova estar estável. Se uma migração causou o problema, a
correção é outra migração.

## Restaurar um backup num ambiente separado

1. Criar uma instância nova, nunca a de produção, e rodar `papeis.sql` e
   `usuarios.sql` com senhas próprias desse ambiente.
2. Restaurar: `pg_restore --no-owner --role=cardapio_dono -d "$URL_ADMIN_NOVO" backup.dump`
   (com `--no-owner`, os objetos ficam do papel de `--role`). Depois,
   `ALTER FUNCTION app.resolver_mesa(text, integer, text) OWNER TO
funcoes_privilegiadas;` para cada função de `banco/funcoes-privilegiadas.ts`.
3. Conferir com `SELECT numero, nome, checksum FROM migracoes.aplicadas ORDER
BY numero` que o esquema está na versão esperada, e rodar
   `pnpm banco:migrar` apontando para a instância nova: deve dizer "Nada a
   aplicar".
4. Rodar os testes de catálogo contra a cópia se houver dúvida sobre
   permissões.
5. Dados de clientes: a cópia tem dados pessoais. Acesso só para quem
   investiga, e a instância é apagada no fim.

## Alerta: ErroIsolamentoInquilino

O alerta 1 do [runbook do Sentry](sentry-alertas.md) dispara com o código
`BANCO_ISOLAMENTO_VIOLADO`, nível `fatal`.

1. Parar o deploy em andamento e não publicar nada até entender a causa.
2. No evento, ler `restaurante_id`, `caso_de_uso`, `entidade` (a tabela),
   `dados.sqlstate` e `dados.escopo`. Buscar as linhas de log pelo
   `id_rastreio`.
3. O banco recusou o acesso, então nada vazou por esse caminho. A pergunta é
   por que o código tentou: `restaurante_id` vindo de fora da sessão, uma
   rotina do worker no escopo errado ou uma tabela sem `GRANT`.
4. Procurar outros eventos do mesmo `caso_de_uso` e de outros restaurantes
   na mesma janela.
5. Se houver indício de leitura indevida por outro caminho (função
   privilegiada, cache, logs), tratar como incidente de segurança: avaliar em
   até 24 h e avisar os restaurantes afetados (seção 5 do plano).
6. A correção vem com um teste que falhava antes.
