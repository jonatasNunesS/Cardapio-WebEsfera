# M00: Fundação do monorepo (versão 2)

## Contexto

O repositório tem só README.md e LICENSE. O plano já foi lido e revisado; as
decisões abaixo respondem à revisão e valem acima do texto antigo do M00 na
seção 11 do plano.

Antes de começar, crie a partir da seção 11 do plano:

- CLAUDE.md na raiz (com os ajustes da seção "Ajustes no CLAUDE.md" abaixo)
- docs/plano.md (o plano inteiro, como recebido)
- docs/prompts/m00-fundacao.md (este prompt)

Os 5 arquivos de referência de isolamento vão para
docs/referencia/multitenancy/ quando forem enviados. Não são usados no M00.

## Objetivo

Um monorepo que instala, compila, passa no lint e nos testes, sobe localmente
com um comando e tem um CI que bloqueia qualquer PR que quebre as regras do
projeto. Nenhuma regra de negócio.

## Escopo

Dentro: estrutura de pastas, pnpm workspaces, TypeScript, ESLint (flat config)
com fronteiras entre camadas, Prettier, Vitest, regra e script anti-emoji,
regra contra catch vazio, commitlint (commits e título do PR), Docker Compose
com Postgres e Redis, CI no GitHub Actions, Renovate e os ADRs listados abaixo.

Fora: tabelas, migrações e RLS (M02); Sentry e erros tipados (M01);
armazenamento de mídia e seu emulador (M07); qualquer tela ou rota além de
/saude; qualquer integração externa.

## Antes de codar

1. Confira na documentação oficial, hoje, as versões estáveis de: Node 24 LTS,
   pnpm, TypeScript, Vite, React, React Router, Fastify, Vitest, ESLint,
   eslint-plugin-boundaries, typescript-eslint, Prettier, commitlint, madge,
   jscpd, gitleaks e Renovate. Liste versão e URL de cada uma no PR.
2. Confira a data em que o Node 26 entra em LTS ativo e registre no ADR 0001.
   Fique no Node 24.
3. Se alguma ferramenta estiver descontinuada ou tiver mudado de forma
   relevante, pare e pergunte antes de trocar.

## Decisões já tomadas (não reabra)

- Monorepo pnpm, TypeScript estrito, um único PR com commits separados por
  assunto. O lockfile não conta no tamanho.
- Node 24 LTS (.nvmrc e engines no package.json raiz).
- MinIO fica fora: as imagens comunitárias pararam em outubro de 2025 e o
  provedor de mídia só é escolhido no M07.
- gitleaks roda pelo binário no CI, não pela action.
- Domínios futuros: subdomínios do mesmo domínio registrável (cardapio.,
  painel., admin., api.). No M00 isso só aparece como variáveis em
  .env.exemplo e no ADR 0003.
- Sem emoji em lugar nenhum, inclusive no rodapé do PR. O link do Claude Code
  no rodapé pode ficar.
- TypeScript 6.0.3, e não o 7: o typescript-eslint atual exige
  typescript < 6.1.0 (decidido durante o M00, registrado no ADR 0001).

## Estrutura a criar

```
/
  CLAUDE.md
  package.json                 scripts e engines (node 24)
  pnpm-workspace.yaml          apps/*, pacotes/*
  .nvmrc  .editorconfig  .gitignore  .env.exemplo
  commitlint.config.ts
  renovate.json
  docker-compose.yml           postgres, redis, api, worker
  scripts/
    verificar-emoji.ts         varre todos os arquivos versionados
  apps/
    api/                       Fastify: GET /saude; src/composicao/index.ts
    worker/                    processo que sobe e encerra limpo; src/composicao/index.ts
    cardapio/  painel/  admin/ Vite + React: uma página "ok", sem estilo além de tokens vazios
  pacotes/
    dominio/                   src/compartilhado/index.ts vazio; src/index.ts
    aplicacao/  infraestrutura/  contratos/  ui/  observabilidade/
                               src/index.ts vazio e package.json
    config/
      tsconfig.base.json       strict, noUncheckedIndexedAccess,
                               exactOptionalPropertyTypes
      eslint.config.ts
      prettier.config.ts
      eslint/regras/sem-emoji.ts
      eslint/regras/sem-catch-vazio.ts
      src/ambiente.ts          carregarAmbiente(esquema Zod)
  .github/workflows/ci.yml
  docs/
    plano.md
    prompts/m00-fundacao.md
    adr/0001-monorepo-e-ferramentas.md
    adr/0002-fronteiras-entre-camadas.md
    adr/0003-dominios-e-ambientes.md
    adr/0004-hospedagem.md
```

## Regras de fronteira (eslint-plugin-boundaries)

1. `dominio`: não importa nenhum pacote do monorepo nem biblioteca externa,
   salvo utilitários puros aprovados no ADR 0002 (nenhum no M00).
2. `aplicacao`: só `dominio`.
3. `infraestrutura`: `aplicacao`, `dominio` e `config`.
4. `contratos`: só a biblioteca Zod.
5. `observabilidade`: `dominio` e `config`.
6. `ui`: nada do monorepo.
7. `apps/api` e `apps/worker`: `aplicacao`, `contratos`, `observabilidade` e
   `config`. Somente os arquivos em `src/composicao/` podem importar
   `infraestrutura`; ali as portas são ligadas aos adaptadores.
8. `apps/cardapio`, `apps/painel` e `apps/admin`: `contratos`, `ui` e
   `config`. Nunca `infraestrutura`, `aplicacao` ou `dominio`.
9. Dependência circular entre arquivos quebra o CI (madge).

O ADR 0002 registra estas regras, o motivo da exceção da composição e onde
ficarão os erros.

## Onde ficarão os erros (só registrar agora; código no M01)

- `dominio/src/compartilhado`: `Resultado`, `ErroDeNegocio`, `ErroAplicacao`
  e `ErroInvarianteDominio`, em TypeScript puro.
- `aplicacao`: `ErroDependenciaExterna` e `ErroIsolamentoInquilino`, junto
  das portas.
- `observabilidade`: só traduz esses erros para o Sentry e o logger.

No M00 crie apenas a pasta `dominio/src/compartilhado` com um index vazio.

## Regras próprias de lint e verificações

1. `sem-emoji` (ESLint): falha em qualquer pictograma em strings, template
   literals, JSX e comentários. Defina a faixa Unicode com base na lista
   oficial de emoji e cite a fonte no código do teste, não em comentário.
2. `scripts/verificar-emoji.ts`: lê a lista de `git ls-files` e falha se
   qualquer arquivo de texto tiver pictograma (Markdown, YAML, JSON, CSS, HTML,
   SQL). Ignora binários e o lockfile. Roda no CI e em `pnpm verificar`.
3. `sem-catch-vazio` (ESLint): falha em `catch` vazio, em `catch` que só
   registra log e em `catch` que não relança nem chama uma função de reporte.
   A regra aceita uma lista configurável de nomes; no M00 ela começa com
   `reportarErro`.
4. `commitlint`: commits convencionais, sem emoji. Roda no hook de commit local
   e no CI sobre todos os commits do PR e sobre o título do PR.
5. `carregarAmbiente(esquema)`: valida `process.env` com Zod e, se faltar ou
   estiver inválida alguma variável, encerra o processo com a lista completa
   dos problemas, sem mostrar valores.

## Docker Compose

- `postgres` (versão estável atual) com volume e healthcheck.
- `redis` com `appendonly yes`, volume e healthcheck.
- `api` e `worker` a partir do código, dependendo dos dois acima estarem
  saudáveis, usando `.env` (não versionado; `.env.exemplo` é o modelo).
- Nada de armazenamento de mídia.
- Se não houver Docker no ambiente, valide o arquivo com o que for possível,
  deixe a prova real para o job do CI e diga isso no PR.

## CI (.github/workflows/ci.yml)

Em todo PR e na `main`, nesta ordem, parando no primeiro erro: instalar com
lockfile congelado; verificar emoji; lint; tipos; testes; build dos 5 apps;
madge; jscpd (falha acima de 3% de duplicação); gitleaks pelo binário;
auditoria de dependências (falha em alta e crítica); commitlint dos commits e
do título do PR; e um job que sobe o docker compose e chama GET /saude. Toda
action fixada por hash de commit.

## .env.exemplo

Somente nomes e descrições, sem valores reais: `NODE_ENV`, `APP_ENV` (local,
preview, homologacao, producao), `PORTA_API`, `URL_BANCO`, `URL_REDIS`,
`DOMINIO_CARDAPIO`, `DOMINIO_PAINEL`, `DOMINIO_ADMIN`, `DOMINIO_API`.

## ADRs

- 0001 Monorepo e ferramentas: escolhas, versões, Node 24 e a data do LTS do 26.
- 0002 Fronteiras entre camadas: as 9 regras, a exceção da composição e o local
  dos erros.
- 0003 Domínios e ambientes: subdomínios do mesmo domínio registrável, cookies
  só do host para o admin, e o impacto em CORS e SameSite.
- 0004 Hospedagem: 2 ou 3 opções para API, worker, Postgres e Redis
  gerenciados, com preço da página oficial e data da consulta, região
  disponível no Brasil, suporte a contêiner e backups. Termine com uma
  recomendação e deixe a decisão para o John.

## Testes obrigatórios

- `sem-emoji`: aceita texto comum com acentos; recusa pictograma em string,
  template literal, JSX e comentário.
- `verificar-emoji`: recusa um arquivo Markdown de teste com pictograma; aceita
  o mesmo arquivo sem ele; ignora binário.
- `sem-catch-vazio`: recusa catch vazio e catch só com log; aceita relançar e
  aceita chamar reportarErro.
- `commitlint`: recusa mensagem com emoji e mensagem fora do padrão; aceita
  `feat: criar fundação do monorepo`.
- `carregarAmbiente`: com duas variáveis faltando, a mensagem lista as duas e
  não imprime nenhum valor.
- Fronteiras: um arquivo de fixture em `dominio` importando `infraestrutura`
  faz o lint falhar; o mesmo import dentro de `apps/api/src/composicao` passa;
  dentro de `apps/api/src/rotas` falha.
- API: GET /saude responde 200 com `{ "situacao": "ok" }`.
- Worker: sobe e encerra com código 0 ao receber SIGTERM.

## Critério de pronto

- `pnpm install --frozen-lockfile && pnpm verificar` passa do zero.
- `pnpm build` gera os 5 apps.
- O CI passa no PR. O job do compose sobe tudo e /saude responde 200.
- Um commit de teste com emoji é recusado pelo commitlint, e um arquivo
  Markdown com emoji é recusado pelo script (mostrar a saída no PR).

## Proibido

Tailwind ou qualquer framework de CSS; JavaScript sem tipos; `any`; `console`
fora de scripts de linha de comando; dependência sem uso; código de negócio;
armazenamento de mídia; emoji em qualquer lugar.

## Ajustes no CLAUDE.md

Seção Arquitetura substituída pelo texto com a exceção da composição e a
referência a docs/adr/0002; primeira linha da seção Erros aponta para
dominio/src/compartilhado.

## Entrega

Branch: `claude/friendly-fermat-7j9t1x` (a branch da sessão do Claude Code).
Commits convencionais separados por assunto (monorepo, config e lint, regras
próprias, apps, compose, CI, ADRs). PR com título
`feat: fundação do monorepo (M00)` e descrição com: o que foi criado; como
rodar localmente; versões e URLs consultadas; o que não pôde ser provado neste
ambiente; riscos; e sugestões para módulos futuros.
