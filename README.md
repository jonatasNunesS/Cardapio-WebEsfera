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
pnpm verificar        # emoji, lint, formatação, tipos e testes
pnpm build            # gera os 5 apps em apps/*/dist

cp .env.exemplo .env
docker compose up --build --wait
curl http://127.0.0.1:3000/saude   # {"situacao":"ok"}
docker compose down --volumes
```

Os apps React rodam em desenvolvimento com `pnpm --filter @cardapio/cardapio dev`
(o mesmo para `painel` e `admin`).

## Scripts

| Script                 | O que faz                                                  |
| ---------------------- | ---------------------------------------------------------- |
| `pnpm verificar`       | Emoji, lint, formatação, tipos e testes                    |
| `pnpm verificar:emoji` | Procura emoji em todos os arquivos versionados             |
| `pnpm lint`            | ESLint (fronteiras, sem emoji, sem catch vazio) e Prettier |
| `pnpm tipos`           | TypeScript em todos os pacotes                             |
| `pnpm testes`          | Vitest                                                     |
| `pnpm build`           | Build dos 5 apps                                           |
| `pnpm ciclos`          | Dependências circulares (madge)                            |
| `pnpm duplicacao`      | Código duplicado (jscpd, limite de 3%)                     |
| `pnpm auditoria`       | Vulnerabilidades altas e críticas                          |

O `pnpm install` liga o hook de commit em `.githooks`, que roda o commitlint.
