# Cardápio WebEsfera

SaaS de cardápio digital por QR Code para vários restaurantes. Regras do
projeto em [CLAUDE.md](CLAUDE.md); plano completo em [docs/plano.md](docs/plano.md);
decisões em [docs/adr](docs/adr).

## Requisitos

- Node 24.22.0 (`.nvmrc`)
- pnpm 12.14.0 (`npm install --global pnpm@12.14.0` ou `corepack enable`)
- Docker com Compose v2

## Como rodar

```sh
pnpm install --frozen-lockfile
docker compose up --detach --wait postgres   # os testes de banco precisam dele
pnpm verificar        # emoji, lint, formatação, tipos e testes
pnpm build            # gera os 5 apps em apps/*/dist

cp .env.exemplo .env
docker compose up --build --wait
curl http://127.0.0.1:3000/saude          # {"situacao":"ok"}
curl http://127.0.0.1:3000/saude/pronto   # {"situacao":"pronto"}, com o banco migrado
docker compose down --volumes
```

Banco, migrações e usuários: [docs/runbooks/banco.md](docs/runbooks/banco.md).
Filas, outbox e Bull Board: [docs/runbooks/filas.md](docs/runbooks/filas.md) e
[ADR 0009](docs/adr/0009-filas-e-outbox.md).

Os apps React rodam em desenvolvimento com `pnpm --filter @cardapio/cardapio dev`
(o mesmo para `painel` e `admin`).

## Scripts

| Script                  | O que faz                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm verificar`        | Emoji, lint, formatação, tipos e testes                          |
| `pnpm verificar:emoji`  | Procura emoji em todos os arquivos versionados                   |
| `pnpm lint`             | ESLint (fronteiras, acessibilidade, React), stylelint e Prettier |
| `pnpm tipos`            | TypeScript em todos os pacotes                                   |
| `pnpm testes`           | Vitest, inclusive as histórias do Storybook nos 3 temas          |
| `pnpm build`            | Build dos 5 apps                                                 |
| `pnpm ciclos`           | Dependências circulares (madge)                                  |
| `pnpm duplicacao`       | Código duplicado (jscpd, limite de 3%)                           |
| `pnpm auditoria`        | Vulnerabilidades altas e críticas                                |
| `pnpm banco:migrar`     | Aplica as migrações com `URL_BANCO_MIGRACAO`                     |
| `pnpm storybook`        | Storybook do design system em http://localhost:6006              |
| `pnpm storybook:build`  | Storybook estático em `pacotes/ui/storybook-static`              |
| `pnpm visual`           | Compara os snapshots visuais, na imagem Docker do Playwright     |
| `pnpm visual:atualizar` | Regrava a base de snapshots, na mesma imagem                     |

As histórias rodam no Chromium do Playwright (`pnpm exec playwright install chromium`).
Para usar outro Chromium, defina `CAMINHO_CHROMIUM`. O design system está no
[ADR 0007](docs/adr/0007-design-system.md).

O `pnpm install` liga o hook de commit em `.githooks`, que roda o commitlint.

## Observabilidade

API e worker carregam o Sentry com `node --import` (`pnpm --filter @cardapio/api iniciar`).
Sem `SENTRY_DSN_BACKEND`, os erros vão só para o log. Em local, `GET /depuracao/erro`
provoca um erro de teste. Detalhes em [docs/adr/0005-observabilidade.md](docs/adr/0005-observabilidade.md)
e alertas em [docs/runbooks/sentry-alertas.md](docs/runbooks/sentry-alertas.md).
