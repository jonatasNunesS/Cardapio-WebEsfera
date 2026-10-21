FROM node:24.22.0-alpine3.23 AS base
ARG COMMIT_SHA=""
ENV COMMIT_SHA=$COMMIT_SHA
RUN npm install --global pnpm@12.14.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @cardapio/api --filter @cardapio/worker run build

FROM base AS api
USER node
CMD ["node", "--import", "./apps/api/dist/instrumentacao.js", "apps/api/dist/principal.js"]

FROM base AS worker
USER node
CMD ["node", "--import", "./apps/worker/dist/instrumentacao.js", "apps/worker/dist/principal.js"]
