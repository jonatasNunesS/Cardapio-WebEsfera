# ADR 0005: Observabilidade, erros tipados e Sentry

- Situação: aceita (M01)
- Data: 2026-10-21

## Contexto

O plano (seção 8) exige que todo erro inesperado chegue ao Sentry dizendo onde,
quem e por quê, sem dado pessoal (seção 5), e que o usuário receba um id que
leve ao evento. A documentação do Sentry foi lida no repositório oficial da
documentação (https://github.com/getsentry/sentry-docs, commit `24f553d` de
2026-10-21), porque o site docs.sentry.io não abre na rede deste ambiente. As
APIs foram conferidas nos `.d.ts` dos pacotes instalados.

| Pacote                                              | Versão                 |
| --------------------------------------------------- | ---------------------- |
| @sentry/node, @sentry/react, @sentry/vite-plugin    | 11.8.0                 |
| @sentry/cli                                         | 3.8.0                  |
| pino                                                | 10.4.0                 |
| uuid (UUID v7)                                      | 14.0.3                 |
| jsdom, @testing-library/react, axe-core (só testes) | 30.1.3, 16.3.3, 4.14.0 |

## Decisões

### Erros

- `dominio/src/compartilhado`: `Resultado` (`ok`, `falha`, `ehOk`, `ehFalha`,
  `mapear`), `ErroDeNegocio` (um valor, não uma exceção), `ErroAplicacao` e
  `ErroInvarianteDominio`, e o registro `CODIGOS`, no padrão
  `MODULO_ACAO_MOTIVO`, validado por teste.
- `aplicacao/src/compartilhado`: `ErroDependenciaExterna`,
  `ErroIsolamentoInquilino` e a porta `RelatorDeErros`. A aplicação reexporta
  os tipos do domínio, porque a API não importa o domínio direto (regra 7 do
  ADR 0002).
- Erro de negócio nunca vai ao Sentry. A rota traduz a falha em Problem
  Details com `enviarFalhaDeNegocio`, que usa o mapa de status do módulo (409
  ou 422).

### Projetos, releases e amostragem

- Dois projetos: `cardapio-backend` (api e worker) e `cardapio-frontend`
  (cardapio, painel e admin). A tag `app` separa cada um.
- Release `<app>@<versao do package.json>+<sha curto>`, montada por
  `montarRelease` em `pacotes/config` e usada pelo SDK, pelo plugin do Vite e
  pelo envio do backend. Sem `COMMIT_SHA`, o sufixo é `local`.
- Ambiente: `APP_ENV`. Amostragem de traces: 1.0 em local e preview, 0.1 em
  homologação e produção, ou o valor de `SENTRY_AMOSTRAGEM_TRACES`.
- Sem DSN, o Sentry fica desligado e `reportarErro` só escreve no log. Os
  testes usam um transporte falso (`@cardapio/observabilidade/teste`) e nunca
  enviam nada para fora.

### Dados pessoais

O SDK v11 mudou o padrão: com `dataCollection` ausente ele coleta tudo
(cookies, corpos, cabeçalhos, dados de consulta ao banco, variáveis locais da
pilha). Fonte: `includes/migration/javascript-v11/data-collection.mdx` e
`docs/platforms/javascript/common/configuration/options.mdx`. O
`sendDefaultPii` foi substituído por `dataCollection` e está depreciado. Por
isso ligamos o `dataCollection` explicitamente com tudo desligado:

| Categoria                                              | Valor        |
| ------------------------------------------------------ | ------------ |
| `userInfo`, `cookies`, `httpHeaders`, `urlQueryParams` | `false`      |
| `httpBodies`                                           | `[]`         |
| `databaseQueryData`, `queues`, `stackFrameVariables`   | `false`      |
| `graphQL`, `genAI`                                     | tudo `false` |

Além disso, a função pura `limparEvento` roda em `beforeSend`, `limparBreadcrumb`
em `beforeBreadcrumb` e `limparSpan` em `beforeSendSpan`. Elas removem
`user`, cookies, corpo e cabeçalhos fora de uma lista permitida. Também ocultam
o parâmetro `c` e o segmento depois de `/mesa/` nas URLs, mascaram e-mail, CPF
e CNPJ em qualquer texto e ocultam campos com nome sensível.

O `beforeSendSpan` foi acrescentado depois da prova de ponta a ponta: o span
da integração do Fastify levava `url.path` com `?c=` mesmo com
`urlQueryParams: false`, e spans não passam pelo `beforeSend`.

O logger (pino) usa `redact` para `cookie`, `authorization`, `senha`, `token`,
`email`, `documento` e `c`, até dois níveis, e passa todo objeto e mensagem
pela mesma limpeza. A API troca o log de requisição do Fastify por
`ControladorDeLog`, que registra método, rota (o padrão, não a URL), status e
duração, sem IP e sem a URL crua.

### Captura na API

- No v11, `setupFastifyErrorHandler` não faz nada, e a captura é do
  `fastifyIntegration`. O `shouldHandleError` padrão ignora 3xx e 4xx. Fonte:
  `includes/migration/javascript-v11/fastify-error-handler.mdx` e o `.d.ts`
  de `@sentry/server-utils`, que declara suporte ao Fastify 3.21 a 6.
- Configuramos `fastifyIntegration({ shouldHandleError: () => false })`: o
  tratador global da API é o único ponto de captura. Assim o evento sai uma vez
  só, com tags, contextos, fingerprint e título nossos, e o
  `id_rastreio` da resposta é o id desse evento.
- `instrumentacao.ts` é carregado com `node --import` antes de tudo, como
  manda a documentação (`platform-includes/getting-started-node/javascript.mdx`).
- O rastreio aceita `x-id-rastreio` só quando é um UUID; senão gera um UUID
  v7. O cabeçalho volta na resposta e vira a tag `id_rastreio` do evento.
- `GET /depuracao/erro` só existe com `APP_ENV` local ou preview.

### Entradas do pacote de observabilidade

| Entrada                           | Conteúdo                                                                                  | Quem importa                    |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| `@cardapio/observabilidade`       | Limpeza de dados, pura                                                                    | Ninguém fora do pacote, por ora |
| `@cardapio/observabilidade/node`  | Contexto (AsyncLocalStorage), logger, Sentry Node, `reportarErro`, tratadores do processo | api e worker                    |
| `@cardapio/observabilidade/web`   | `iniciarSentryWeb`, `reportarErroWeb`, `FronteiraDeErro`                                  | Apps React                      |
| `@cardapio/observabilidade/teste` | Transporte falso do Sentry                                                                | Testes                          |

### Mudanças nas fronteiras (ADR 0002)

- Regra 5: `observabilidade` passa a importar `aplicacao`, além de `dominio` e
  `config`. Ela é um adaptador: implementa a porta `RelatorDeErros` e trata
  `ErroIsolamentoInquilino` e `ErroDependenciaExterna`. Decisão do John em
  2026-10-21.
- Regra 8: os apps React podem importar exatamente
  `@cardapio/observabilidade/web`, e nada mais desse pacote.
- A entrada web não pode puxar código de Node. Há duas barreiras: o plugin
  `bloquearModulosDeNode` (em `pacotes/config/vite`) faz o build falhar se
  algum módulo nativo do Node, `pino`, `@sentry/node` ou os arquivos de Node do
  pacote forem resolvidos; e `scripts/verificar-bundle-web.ts` procura
  especificadores `node:` e `pino` nos bundles depois do `pnpm build`.

### Source maps

- Frontend: `build.sourcemap: "hidden"` e `sentryVitePlugin`, ativo só com
  `SENTRY_AUTH_TOKEN`, com os `.map` apagados depois do envio. Fonte:
  `docs/platforms/javascript/common/sourcemaps/uploading/vite.mdx`.
- Backend: o `tsc` gera os mapas e o `build` da api e do worker roda
  `sentry-cli sourcemaps inject dist`. Fonte: `includes/sentry-cli-sourcemaps.mdx`.
  Os debug IDs são deterministas (o mesmo arquivo gera o mesmo id; conferido
  aqui e entre a imagem Docker e o build local). Por isso os mapas enviados pelo
  CI casam com a imagem construída à parte.
- Os pacotes do workspace rodam como fonte `.ts`, com os tipos removidos pelo
  Node 24, que preserva linha e coluna. Os quadros desses pacotes já apontam
  para o TypeScript, sem mapa.
- No push para a `main`, o job `source-maps` do CI envia tudo. Em PR não há
  token, não há envio e o CI passa.

## Consequências

- `reportarErro` devolve o id do evento. A resposta 500 traz esse id em
  `id_rastreio`, que é encontrado direto na busca do Sentry.
- Um erro em código React é capturado pela `ErrorBoundary` do Sentry. O
  usuário vê a `TelaDeErro` do pacote `ui` com o id.
- O bundle do cardápio passou de 68,7 KB para 101,6 KB comprimidos por causa
  do SDK do navegador. Continua abaixo da meta de 170 KB (seção 9).
