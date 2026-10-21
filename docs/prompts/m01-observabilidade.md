# M01: Observabilidade, erros tipados e Sentry

## Contexto

M00 aceito e na main: monorepo pnpm, TypeScript estrito, fronteiras entre
camadas, regras sem-emoji e sem-catch-vazio, commitlint, compose com Postgres e
Redis, CI completo, ADRs 0001 a 0004. Ainda não há regra de negócio, banco nem
filas.

Leia antes: CLAUDE.md, docs/adr/0002, e no plano as seções 8 ("Qualidade,
testes e tratamento de erros"), 5 (LGPD) e 10 (monitoramento).

## Objetivo

Todo erro do sistema passa a ter tipo, código e contexto. Erro de negócio vira
resposta clara, sem barulho. Erro inesperado chega ao Sentry dizendo onde, quem
e por quê, sem dado pessoal, e o usuário recebe um id de rastreio que leva
direto ao evento.

## Escopo

Dentro:

- Resultado e a hierarquia de erros (dominio e aplicacao).
- Pacote observabilidade: logger, contexto de rastreio, reporte de erros,
  limpeza de dados pessoais, entrada para Node e entrada para navegador.
- API: instrumentação do Sentry, tratador global de erros e respostas no
  formato Problem Details.
- Worker: instrumentação, envoltório genérico de tarefas e tratadores de falha
  do processo.
- Apps React: inicialização do Sentry, fronteira de erro e tela de erro.
- Source maps enviados ao Sentry no CI.
- ADR 0005 e o runbook dos alertas.

Fora: BullMQ (M05; aqui o envoltório é genérico); banco e RLS (M02); qualquer
regra de negócio; configuração dos alertas no site do Sentry (fica documentada
no runbook e o John faz manualmente).

## Antes de codar

Confira na documentação oficial, hoje, e cite as URLs no PR:

1. Sentry para Fastify (`@sentry/node`, v11): como o arquivo de
   instrumentação é carregado com `--import` em ESM, o que a integração do
   Fastify captura sozinha (a doc diz que ignora 3xx e 4xx) e a opção
   `shouldHandleError`.
2. A opção atual de controle de dados pessoais. A doc da v11 cita
   `dataCollection`, e não `sendDefaultPii`. Use a que estiver documentada.
   Confira também o `beforeSend` e o `beforeBreadcrumb`.
3. Sentry para React (`@sentry/react`): inicialização, `ErrorBoundary`,
   integração com React Router e releases.
4. `@sentry/vite-plugin` (`sentryVitePlugin`): `build.sourcemap: "hidden"`,
   `sourcemaps.filesToDeleteAfterUpload` e o token por `SENTRY_AUTH_TOKEN`. O
   plugin não envia nada no modo de desenvolvimento.
5. Como enviar os source maps da API e do worker (sentry-cli ou o plugin do
   bundler que o M00 escolheu).
6. pino: a opção de redação de campos (`redact`) e o uso com Fastify. Se algo
   divergir deste prompt, siga a documentação e explique no PR.

## Decisões já tomadas

- Dois projetos no Sentry: `cardapio-backend` (api e worker) e
  `cardapio-frontend` (cardapio, painel e admin). A tag `app` separa cada um.
- Release: `<app>@<versao do package.json>+<sha curto>`. Ambiente: `APP_ENV`
  (local, preview, homologacao, producao).
- Sem DSN, o Sentry fica desligado e o reporte vai só para o logger. Os testes
  nunca enviam nada para fora.
- Amostragem de traces: 1.0 em local e preview, 0.1 em homologação e
  produção, configurável por variável.
- Os apps React importam só a entrada de navegador do pacote
  (`@cardapio/observabilidade/web`). Atualize a regra 8 de fronteira para
  permitir exatamente esse caminho e mais nada. A entrada web não pode
  importar pino nem nada de Node; um teste de build garante isso.
- Decidido durante o módulo: `observabilidade` passa a importar `aplicacao`
  (regra 5), porque implementa a porta `RelatorDeErros`.

## Arquivos e responsabilidades

### pacotes/dominio/src/compartilhado

- `resultado.ts`: `Resultado<S, F>` com `ok(valor)` e `falha(erro)`, `ehOk`,
  `ehFalha` e `mapear`. Sem exceções.
- `erro-de-negocio.ts`: `ErroDeNegocio` com `codigo`, `mensagem` (para o
  usuário, em português) e `detalhes` opcionais. Não estende `Error`: é um
  valor, não uma exceção.
- `erro-aplicacao.ts`: `ErroAplicacao extends Error` com `codigo`,
  `contexto` (`modulo`, `casoDeUso?`, `restauranteId?`, `entidade?`,
  `entidadeId?`, `dados?`) e `cause`. `name` igual ao da subclasse.
- `erro-invariante-dominio.ts`: subclasse para regra do domínio violada, o que
  é sempre bug.
- `codigos.ts`: os códigos são constantes `MODULO_ACAO_MOTIVO`, em maiúsculas
  e únicos. Um teste falha se houver código repetido ou fora do padrão.

### pacotes/aplicacao/src/compartilhado/erros

- `erro-dependencia-externa.ts`: com `provedor`, `operacao`, `statusHttp?`,
  `tentativa?`, `tentativasMaximas?` e `duracaoMs?`.
- `erro-isolamento-inquilino.ts`: violação de isolamento entre restaurantes.
  Sempre nível `fatal`.
- `portas/relator-de-erros.ts`: a porta `RelatorDeErros` com
  `reportar(erro, extra)` e `registrarPasso(passo)`, para a aplicação reportar
  sem conhecer o Sentry.

### pacotes/observabilidade

- `src/contexto.ts`: contexto por requisição ou tarefa com AsyncLocalStorage:
  `idRastreio`, `app`, `rota` ou `tarefa`, `restauranteId?` e `casoDeUso?`.
  Funções `executarComContexto` e `contextoAtual`.
- `src/node/logger.ts`: logger pino em JSON, sempre com `idRastreio`, `app`,
  `modulo` e `restauranteId` quando houver. Redação de `cookie`,
  `authorization`, `senha`, `token`, `email`, `documento` e `c` (código do QR).
- `src/limpeza.ts`: função pura `limparEvento(evento)` usada no `beforeSend` e
  no `beforeBreadcrumb`. Remove cookies, corpo da requisição e cabeçalhos de
  autenticação. Na URL, troca o parâmetro `c` e o segmento depois de `/mesa/`
  por `[oculto]`. Em qualquer texto, mascara e-mail, CPF e CNPJ. Mantém
  `restaurante_id`.
- `src/node/sentry.ts`: `iniciarSentryNode({ app, dsn, release, ambiente })` e
  a implementação Sentry de `RelatorDeErros`.
- `src/node/reportar-erro.ts`: `reportarErro(erro, extra?)`, que:
  1. Lê o contexto atual.
  2. Põe as tags `app`, `modulo`, `caso_de_uso`, `restaurante_id`, `rota`,
     `tarefa` e `codigo`.
  3. Põe os contextos `negocio` (entidade, id e dados limpos) e `dependencia`
     (provedor, operação, status, tentativa e duração), quando existirem.
  4. Usa o fingerprint `[codigo, modulo]`.
  5. Usa nível `fatal` para `ErroIsolamentoInquilino` e `error` para o resto.
  6. Usa como título: classe, código e mensagem, por exemplo
     `ErroDependenciaExterna: PAGAMENTO_CONSULTA_FALHOU - Mercado Pago não respondeu`.
  7. Devolve o id do evento, que vira o `id_rastreio` da resposta (quando o
     Sentry está desligado, usa o id do contexto).
- `src/web/index.ts`: `iniciarSentryWeb({ app, dsn, release, ambiente })`,
  `reportarErroWeb` e `FronteiraDeErro` (envolve o `ErrorBoundary` do Sentry).
  Sem Node.

### apps/api

- `src/instrumentacao.ts`: carregado com `--import` antes de tudo. Chama
  `iniciarSentryNode`.
- `src/http/tratador-de-erros.ts`: um tratador global do Fastify.
  - Zod: 400.
  - `ErroDeNegocio` devolvido por caso de uso e traduzido na rota: 409 ou 422,
    conforme o mapa do módulo.
  - Rota inexistente: 404, sem Sentry.
  - Qualquer outro erro: 500, com `reportarErro`.
  - Toda resposta de erro no formato RFC 9457: `type`, `title`, `status`,
    `detail` em português, `codigo` e `id_rastreio`. Nunca expõe stack, SQL ou
    mensagem interna.
- `src/http/rastreio.ts`: lê `x-id-rastreio` da requisição ou gera um UUID v7,
  devolve no cabeçalho da resposta e abre o contexto.
- Uma rota `GET /depuracao/erro`, registrada só quando `APP_ENV` for local ou
  preview, que lança um `ErroAplicacao` de teste.
- Tratadores do processo: `unhandledRejection` e `uncaughtException`
  reportam, registram no log e encerram com código 1, depois de esperar o envio
  pendente do Sentry por no máximo 2 s.

### apps/worker

- `src/instrumentacao.ts`: o mesmo padrão da API.
- `src/execucao/executar-tarefa.ts`: `executarTarefa(nome, dados, fn)` abre o
  contexto (`tarefa`, `idRastreio`, `restauranteId` se vier nos dados),
  registra início e fim, e em caso de erro chama `reportarErro` com a tag
  `tarefa` e relança. O M05 vai embrulhar os processadores BullMQ com ela.
- Os mesmos tratadores de falha do processo.

### apps/cardapio, apps/painel e apps/admin

- Inicializam o Sentry com `iniciarSentryWeb` e a tag `app` própria.
- Envolvem a aplicação com `FronteiraDeErro`. A tela de erro fica em
  `pacotes/ui`, com tokens, título "Algo deu errado", texto "Já fomos
  avisados. Tente de novo.", o `id_rastreio` em letra pequena e o botão
  "Tentar de novo". Sem emoji, acessível, com `role="alert"`.
- `sentryVitePlugin` no build, ativo só quando `SENTRY_AUTH_TOKEN` existir,
  com `build.sourcemap: "hidden"` e os `.map` apagados depois do envio.

### CI

- No push para a main: envio dos source maps dos 5 apps e da release, usando
  `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e os nomes dos projetos (segredos do
  GitHub).
- Em PR: build sem token, sem envio, e o CI continua passando.
- Novo teste de build: o bundle de cada app React não contém `pino` nem
  módulos `node:`.

### Documentação

- `docs/adr/0005-observabilidade.md`: projetos, releases, amostragem, limpeza
  de dados, entradas Node e web, e a exceção da regra 8.
- `docs/runbooks/sentry-alertas.md`: os 6 alertas da seção 8 do plano, com o
  filtro de cada um no Sentry e o que fazer quando disparar.
- `.env.exemplo`: `SENTRY_DSN_BACKEND`, `SENTRY_DSN_FRONTEND`,
  `SENTRY_AMOSTRAGEM_TRACES`, `SENTRY_ORG`, `SENTRY_PROJETO_BACKEND` e
  `SENTRY_PROJETO_FRONTEND`, todos vazios. O `SENTRY_AUTH_TOKEN` só existe
  nos segredos do CI e nunca no `.env`.

## Regras

1. Nenhum `try/catch` fora dos quatro lugares permitidos: tratador global,
   `executarTarefa`, adaptadores externos e `FronteiraDeErro`. A regra
   sem-catch-vazio continua valendo.
2. Erro de negócio nunca vai ao Sentry. Bug sempre vai.
3. Nenhum dado pessoal sai do processo: nem para o Sentry, nem para o log.
4. Todo erro inesperado devolve um `id_rastreio` ao usuário, e esse id
   encontra o evento no Sentry.
5. A aplicação depende só da porta `RelatorDeErros`. Só a composição liga a
   implementação do Sentry.

## Testes obrigatórios

- `Resultado`: `ok`, `falha`, `mapear` e o estreitamento de tipos (`ehOk` e
  `ehFalha`).
- `codigos`: falha com código repetido ou fora do padrão.
- `ErroAplicacao`: `name` da subclasse, `cause` preservado e contexto intacto.
- `limparEvento`: remove cookie, corpo e authorization; oculta o código do QR
  em `/brasa-e-trigo/mesa/12?c=Abc123`; mascara e-mail, CPF (formatado e só
  números) e CNPJ; mantém o `restaurante_id`.
- `reportarErro`, com um transporte falso do Sentry: põe as tags certas, os
  contextos `negocio` e `dependencia`, o fingerprint `[codigo, modulo]`, o
  nível `fatal` para isolamento e o título no formato definido; sem DSN, só
  registra no log.
- API, com o Fastify em memória: erro de negócio dá 422 em Problem Details,
  sem Sentry; Zod dá 400 com os campos; rota inexistente dá 404 sem Sentry;
  erro inesperado dá 500 com `id_rastreio` igual ao id do evento, o Sentry é
  chamado uma vez e a resposta não tem stack; o `x-id-rastreio` recebido é
  devolvido no cabeçalho de resposta; `/depuracao/erro` não existe com
  `APP_ENV=producao`.
- Worker: `executarTarefa` reporta com a tag `tarefa` e relança; no sucesso,
  não reporta.
- React: `FronteiraDeErro` mostra a tela de erro com o id e reporta uma vez. A
  tela passa no axe.
- Build: nenhum app React contém `pino` ou `node:` no bundle.

## Critério de pronto

- `pnpm verificar` e `pnpm build` verdes; CI verde no PR (sem token).
- Com um DSN de teste no `.env` local, `GET /depuracao/erro` cria um evento no
  Sentry. No PR, mostrar um print ou a descrição do evento com as tags, os
  contextos, o título e a linha do arquivo TypeScript. Sem DSN no ambiente,
  dizer isso e deixar a prova para o John.
- O runbook lista os 6 alertas, prontos para configurar.

## Proibido

`console.log` (use o logger); qualquer dado pessoal no Sentry ou no log;
capturar e ignorar erro; Sentry importado direto pela aplicação ou pelo
domínio; `sendDefaultPii` ou equivalente ligado; o `SENTRY_AUTH_TOKEN` em
arquivo versionado; emoji em qualquer lugar.

## Entrega

Branch da sessão. Commits por assunto (dominio e aplicacao, observabilidade
node, observabilidade web, api, worker, apps React, CI e source maps, docs).
PR com título `feat: observabilidade e erros tipados (M01)` e descrição com: o
que foi criado; as URLs consultadas; o que ficou para o John fazer no Sentry;
o que não pôde ser provado no ambiente; riscos; e sugestões para módulos
futuros.
