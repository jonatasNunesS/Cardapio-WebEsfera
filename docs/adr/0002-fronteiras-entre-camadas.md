# ADR 0002: Fronteiras entre camadas

- Situação: aceita (M00)
- Data: 2026-10-21

## Contexto

O plano (seção 2) define Clean Architecture: interface, aplicação e domínio,
com a infraestrutura implementando as portas. Com uma IA escrevendo o código,
a regra precisa ser verificada pela máquina, não pela memória de quem revisa.

## Decisão

O `eslint-plugin-boundaries` 7 (regra `boundaries/dependencies`, com
`default: disallow` e `checkAllOrigins: true`) classifica cada arquivo pela
pasta e só permite o que está listado. Bibliotecas externas e módulos do Node
também passam pelas políticas. A configuração está em
`pacotes/config/eslint.config.ts`.

| Elemento          | Pasta                                                   | Pode importar                                                                               |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `dominio`         | `pacotes/dominio`                                       | Nada: nem pacote do monorepo, nem biblioteca, nem `node:*`                                  |
| `aplicacao`       | `pacotes/aplicacao`                                     | `dominio`                                                                                   |
| `infraestrutura`  | `pacotes/infraestrutura`                                | `aplicacao`, `dominio`, `config` e bibliotecas                                              |
| `contratos`       | `pacotes/contratos`                                     | Só a biblioteca `zod`                                                                       |
| `observabilidade` | `pacotes/observabilidade`                               | `dominio`, `aplicacao` (desde o M01), `config` e bibliotecas                                |
| `ui`              | `pacotes/ui`                                            | Nada do monorepo; bibliotecas                                                               |
| `config`          | `pacotes/config`                                        | Nada do monorepo; bibliotecas                                                               |
| `app-servidor`    | `apps/api`, `apps/worker`                               | `aplicacao`, `contratos`, `observabilidade`, `config`, a própria `composicao` e bibliotecas |
| `composicao`      | `apps/api/src/composicao`, `apps/worker/src/composicao` | Tudo o que o `app-servidor` pode, mais `infraestrutura` e o próprio app                     |
| `app-web`         | `apps/cardapio`, `apps/painel`, `apps/admin`            | `contratos`, `ui`, `config`, `@cardapio/observabilidade/web` (desde o M01) e bibliotecas    |
| `ferramentas`     | `scripts`                                               | `config` e bibliotecas                                                                      |

Arquivos de teste (`*.test.ts`, `*.test.tsx`) também podem importar `vitest`
e `node:*`, inclusive no domínio.

As 9 regras do M00:

1. `dominio` não importa nenhum pacote do monorepo nem biblioteca externa,
   salvo utilitários puros aprovados neste ADR (nenhum até agora).
2. `aplicacao` só importa `dominio`.
3. `infraestrutura` importa `aplicacao`, `dominio` e `config`.
4. `contratos` só importa a biblioteca Zod.
5. `observabilidade` importa `dominio`, `aplicacao` e `config`. A `aplicacao`
   entrou no M01: a observabilidade implementa a porta `RelatorDeErros` (ADR 0005).
6. `ui` não importa nada do monorepo.
7. `apps/api` e `apps/worker` importam `aplicacao`, `contratos`,
   `observabilidade` e `config`. Só os arquivos em `src/composicao/` importam
   `infraestrutura`.
8. `apps/cardapio`, `apps/painel` e `apps/admin` importam `contratos`, `ui` e
   `config`, e do pacote de observabilidade só `@cardapio/observabilidade/web`
   (desde o M01, ADR 0005). Nunca `infraestrutura`, `aplicacao` ou `dominio`.
9. Dependência circular entre arquivos quebra o CI (madge).

### Por que a exceção da composição

A inversão de dependência exige que alguém ligue cada porta (definida na
aplicação) ao seu adaptador (na infraestrutura). Esse ponto é a raiz de
composição de cada processo. Concentrá-la em `src/composicao/` deixa o resto
da API e do worker (rotas, processadores de fila) sem saber qual adaptador está
por trás. Trocar Mercado Pago, provedor de mídia ou e-mail muda só a
composição. Os apps React não têm composição de infraestrutura: falam com a
API por HTTP, com os esquemas de `contratos`.

### Onde ficam os erros (código no M01)

- `dominio/src/compartilhado`: `Resultado`, `ErroDeNegocio`, `ErroAplicacao` e
  `ErroInvarianteDominio`, em TypeScript puro. Assim o domínio lança e devolve
  os próprios erros sem importar nada.
- `aplicacao`: `ErroDependenciaExterna` e `ErroIsolamentoInquilino`, junto das
  portas que os produzem.
- `observabilidade`: só traduz esses erros para o Sentry e o logger.

### O pacote ui no M00

`pacotes/ui` exporta só `montarAplicacao`, a montagem do React com
`StrictMode`, que os três apps usavam igual. Os tokens e os componentes chegam
no M03.

## Consequências

- Um import proibido quebra `pnpm lint` e o CI, com a mensagem apontando para
  este ADR.
- `pacotes/config/eslint/fronteiras.test.ts` prova a regra: `dominio`
  importando `infraestrutura` falha; a composição da API importando
  `infraestrutura` passa; uma rota da API importando `infraestrutura` falha.
- Liberar uma biblioteca no domínio exige mudar este ADR.
