# ADR 0001: Monorepo e ferramentas

- Situação: aceita (M00)
- Data: 2026-10-21

## Contexto

O Cardápio WebEsfera tem três SPAs React, uma API Fastify, um worker de filas e
pacotes compartilhados por camada (seção 2 do plano). Precisamos de um único
repositório com tipos de ponta a ponta, lint que garanta as regras do
`CLAUDE.md` e um CI que bloqueie qualquer PR fora delas.

## Decisão

Monorepo pnpm com workspaces `apps/*` e `pacotes/*`, TypeScript estrito,
ESLint em flat config, Prettier, Vitest e um CI no GitHub Actions. As versões
foram conferidas em 2026-10-21 no registro do npm (`npm view <pacote>`) e nas
fontes oficiais abaixo. Todas as versões ficam fixas (`saveExact`), e o
Renovate propõe as atualizações.

| Ferramenta                             | Versão                                                  | Fonte                                                                  |
| -------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Node.js                                | 24.22.0 (linha 24, LTS "Krypton")                       | https://nodejs.org/dist/index.json e https://github.com/nodejs/Release |
| pnpm                                   | 12.14.0                                                 | https://www.npmjs.com/package/pnpm                                     |
| TypeScript                             | 6.0.3 (ver abaixo)                                      | https://www.npmjs.com/package/typescript                               |
| Vite                                   | 8.3.4                                                   | https://www.npmjs.com/package/vite                                     |
| @vitejs/plugin-react                   | 6.1.2                                                   | https://www.npmjs.com/package/@vitejs/plugin-react                     |
| React e React DOM                      | 19.3.1                                                  | https://www.npmjs.com/package/react                                    |
| React Router                           | 8.5.0 (conferida, ainda não instalada)                  | https://www.npmjs.com/package/react-router                             |
| Fastify                                | 5.12.7                                                  | https://www.npmjs.com/package/fastify                                  |
| Zod                                    | 4.6.7                                                   | https://www.npmjs.com/package/zod                                      |
| Vitest                                 | 5.0.5                                                   | https://www.npmjs.com/package/vitest                                   |
| ESLint                                 | 10.13.0                                                 | https://www.npmjs.com/package/eslint                                   |
| typescript-eslint                      | 8.72.0                                                  | https://www.npmjs.com/package/typescript-eslint                        |
| eslint-plugin-boundaries               | 7.2.0                                                   | https://www.npmjs.com/package/eslint-plugin-boundaries                 |
| eslint-import-resolver-typescript      | 4.4.5                                                   | https://www.npmjs.com/package/eslint-import-resolver-typescript        |
| Prettier                               | 3.9.10                                                  | https://www.npmjs.com/package/prettier                                 |
| commitlint (cli e config-conventional) | 21.2.4                                                  | https://www.npmjs.com/package/@commitlint/cli                          |
| madge                                  | 8.0.0                                                   | https://www.npmjs.com/package/madge                                    |
| jscpd                                  | 5.4.1 (ver abaixo)                                      | https://www.npmjs.com/package/jscpd                                    |
| gitleaks                               | 8.30.1 (binário com SHA-256 conferido)                  | https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1              |
| Renovate                               | 44.173.0 (serviço; o repositório só tem a configuração) | https://www.npmjs.com/package/renovate                                 |
| PostgreSQL (imagem local)              | 18.6-alpine3.23                                         | https://hub.docker.com/_/postgres                                      |
| Redis (imagem local)                   | 8.8.3-alpine3.23                                        | https://hub.docker.com/_/redis                                         |

### Node 24 e a data do Node 26

Pelo calendário oficial (https://github.com/nodejs/Release, arquivo
`schedule.json`, consultado em 2026-10-21):

| Linha | LTS ativo  | Manutenção | Fim        |
| ----- | ---------- | ---------- | ---------- |
| 24    | 2025-10-28 | 2026-10-20 | 2028-04-30 |
| 26    | 2026-10-28 | 2027-10-20 | 2029-04-30 |

O Node 24 entrou em manutenção em 2026-10-20: só recebe correções críticas e de
segurança até 2028-04-30. O Node 26 vira LTS ativo em 2026-10-28.

Decisão do John em 2026-10-22: o projeto fica no Node 24 LTS, e a tarefa de
migração para o Node 26 foi cancelada. O Node 24 tem suporte de segurança até
2028-04-30. A migração será reavaliada no primeiro trimestre de 2028, antes do
fim do suporte. Até lá, o Renovate fica travado em `< 25` para o Node e o
`@types/node`, e só sobe versões de correção da linha 24.

### TypeScript 6.0.3, e não o 7

A versão estável mais recente do TypeScript é a 7.0.2 (2026-07-08), o
compilador nativo, que só expõe uma API marcada como `unstable`. O
typescript-eslint 8.72.0 exige `typescript >=4.8.4 <6.1.0`. Sem ele não temos
as regras com tipos (`no-explicit-any`, `no-unsafe-*`) nem o parser das regras
próprias. Decisão do John em 2026-10-21: TypeScript 6.0.3. O Renovate está
travado em `< 6.1.0` até o typescript-eslint suportar o 7.

### Opções do TypeScript

`tsconfig.base.json` liga `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` e também `erasableSyntaxOnly` e
`verbatimModuleSyntax`. Assim todo arquivo `.ts` roda direto no Node 24, que
remove os tipos sem transpilar. Os scripts (`node scripts/verificar-emoji.ts`)
e os pacotes internos não precisam de etapa de build. A API e o worker
compilam para `dist/` com `tsc`. Os pacotes do workspace continuam sendo
importados como fonte `.ts`, e o Node remove os tipos em tempo de execução.

### Regras do plugin cardapio

As regras próprias ficam em `pacotes/config/eslint/regras` e são registradas
no plugin `cardapio`.

#### Regra sem-emoji

Falha em qualquer caractere com as propriedades Unicode `Emoji_Presentation` ou
`Extended_Pictographic`, no seletor de variação U+FE0F e no U+20E3 (UTS #51,
https://www.unicode.org/reports/tr51/). Os símbolos tipográficos U+00A9,
U+00AE e U+2122 são permitidos quando aparecem sem U+FE0F. A mesma função
(`encontrarEmojis`) é usada pela regra do ESLint, por `scripts/verificar-emoji.ts`
(todos os arquivos versionados, exceto binários e o lockfile) e pelo
commitlint.

#### Regra sem-catch-vazio

Falha em `catch` vazio e em `catch` que não relança (`throw`) nem chama uma
das funções de reporte configuradas, que no M00 é só `reportarErro`. Um
`throw` dentro de uma função aninhada não conta.

#### Ajustes de tipo

Os tipos de regra do typescript-eslint e os do ESLint 10 divergem, e o `.d.ts`
do eslint-plugin-boundaries descreve um export ESM que, em tempo de execução,
é o próprio plugin. Os dois ajustes são uma conversão de tipo explícita, cada
uma num único ponto (`eslint/plugin.ts` e `eslint.config.ts`).

### Cadeia de suprimentos

- O pnpm 12 recusa versões publicadas há pouco tempo. O jscpd 5.4.2 saiu em
  2026-10-20; ficamos no 5.4.1 em vez de abrir exceção.
- O script de instalação do `unrs-resolver` (dependência do resolvedor do
  ESLint) foi negado em `allowBuilds`: o binário nativo vem pelos pacotes
  opcionais e funciona sem ele.
- `handlebars` foi forçado para 4.7.10 (`overrides`), que corrige
  GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f (críticas) e GHSA-xw65-4hp5-5hc7.
  Ele chega pelo eslint-plugin-boundaries, que fixa a 4.7.9.
- GHSA-vfj7-8cjw-p6xm (`braces` <= 3.0.3, negação de serviço por padrão
  aninhado) não tem versão corrigida. O `braces` só processa os globs da nossa
  própria configuração de lint, em desenvolvimento, nunca entrada de rede, e
  não roda em produção. Está em `auditConfig.ignoreGhsas`. Remover a exceção
  quando sair uma versão corrigida.
- O gitleaks roda pelo binário oficial, com o SHA-256 conferido no CI.
- O Renovate espera 3 dias depois de cada publicação (`minimumReleaseAge`) e
  fixa as actions por hash.

### O que ficou para depois

- `eslint-plugin-jsx-a11y` 6.10.2 (a última, de 2024-10-26) declara suporte só
  até o ESLint 9. Fica para o M03, com uma alternativa compatível com o ESLint
  10 ou um ADR próprio.
- O madge 8.0.0 (de 2024-08-05) declara `typescript ^5.4.4` como peer. Ele
  funciona com o 6.0.3, como mostra o teste local de ciclo, mas fica o aviso de
  peer.
- O Redis 8 tem licença AGPLv3, RSALv2 ou SSPLv1. Para desenvolvimento local
  não muda nada. Na hospedagem gerenciada, o ADR 0004 considera o Valkey.

## Consequências

- Um `pnpm verificar` roda emoji, lint, formatação, tipos e testes do
  monorepo inteiro.
- Trocar uma ferramenta é mudar `pacotes/config` e este ADR.
- Ficamos uma versão maior atrás no TypeScript até o typescript-eslint
  suportar o 7.
