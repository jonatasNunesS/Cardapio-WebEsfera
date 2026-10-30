# ADR 0013: Cardápio do cliente

- Situação: proposta (M09)
- Data: 2026-10-29

## Contexto

O M09 monta o app `cardapio`: o cliente abre o link do QR, recebe a sessão de
mesa (rota do M08), vê a abertura, o cardápio com vídeo, o prato e a busca, e
os estados de fechado, QR inválido, sessão expirada e sem conexão. As regras do
prompt (`docs/prompts/m09-cardapio-do-cliente.md`) valem como requisito.

Decisões do John antes de codar (2026-10-29):

1. Sessão expirada pelo `expiraEm` da abertura, sem rota nova. A validação no
   servidor entra no M11, quando o pedido usar o cookie.
2. Service worker escrito à mão.
3. LCP e INP pelo `browserTracingIntegration` do Sentry, alimentado pelo
   web-vitals. Sem métrica customizada.
4. Lighthouse CI em job próprio, 4G simulado, asserções de LCP 2,5 s e JS
   170 KB.

| Componente    | Versão             |
| ------------- | ------------------ |
| react-router  | 8.4.0              |
| @sentry/react | 11.8.0 (já do M01) |
| @lhci/cli     | 0.15.1             |

## Decisões

### Rota e dados

- Uma rota de dados (`createBrowserRouter`): `/:slug/mesa/:numero?c=`. O
  `loader` abre a sessão pela rota do M08 e, em paralelo, busca o cardápio
  público pelo slug da URL. Filhas: o cardápio (índice), `prato/:pratoId` e
  `busca`. Qualquer outra URL mostra a tela de QR inválido.
- O app nunca recebe `restaurante_id`: tem slug, número e código na URL, e a
  resposta da rota da mesa traz só slug, número e `expiraEm`.
- O `?c=` acompanha todos os links internos, para que recarregar qualquer tela
  reabra a mesa. O `shouldRevalidate` só reabre a sessão quando slug, número ou
  código mudam.
- Slug ou número antigos: a rota do M08 responde 301 para o link canônico; o
  `loader` devolve `redirect` para a URL atual do app, com o mesmo código.
- Respostas da rota da mesa: 404 é QR inválido (e esquece a mesa lembrada);
  falha de rede ou erro do servidor segue o caminho sem conexão. Um 5xx nunca
  vira "QR inválido".
- Os cartões do `ui` usam `<a href>`; o app intercepta cliques em links do
  mesmo host e navega pelo roteador, sem recarregar a página.

### Sessão, abertura e armazenamento local

- A sessão fica só no cookie assinado do M08. No `sessionStorage` ficam slug,
  número e `expiraEm` da mesa (para o modo offline e a expiração) e a marca de
  abertura vista. O código do QR não é guardado; há teste.
- A abertura aparece uma vez por sessão de mesa: a marca leva slug, número e
  `expiraEm`, então uma sessão nova (outro `expiraEm`) mostra de novo. Não há
  animação longa a pular: a abertura entra com um deslocamento curto (sem
  mudar a opacidade, para não falsear o contraste) e some com movimento
  reduzido.
- Sessão expirada: um temporizador no `expiraEm` troca a tela pela mensagem de
  escanear de novo. Offline, uma mesa lembrada já vencida também cai nessa
  tela.

### Service worker e cache offline

Escrito à mão (`apps/cardapio/src/offline/trabalhador.ts`), sai como `/sw.js`
na raiz (escopo `/`, registro como módulo depois do `load`). As regras ficam
numa função pura testada (`regras.ts`):

| Pedido                                              | Estratégia                                      | Cache                     |
| --------------------------------------------------- | ----------------------------------------------- | ------------------------- |
| Navegação                                           | Rede primeiro; offline, o `index.html` guardado | `cardapio-app-{versão}`   |
| `/assets/*` (nome com hash)                         | Cache primeiro                                  | `cardapio-app-{versão}`   |
| `GET /api/v1/cardapios/{slug}` sem consulta         | Rede primeiro; offline, a cópia                 | `cardapio-dados-{slug}`   |
| Imagem pública, com a página de um slug como origem | Cache primeiro                                  | `cardapio-imagens-{slug}` |
| Todo o resto                                        | Não intercepta                                  | nenhum                    |

- Nunca entram no cache: a rota da mesa (`/mesa/`, com código e cookie), a
  busca, qualquer consulta com parâmetros, qualquer escrita, vídeos e outras
  origens. Há teste das regras e um e2e que lista o conteúdo dos caches.
- Isolamento: cada restaurante tem o seu cache de dados e de imagens, pela
  chave do slug; a resposta de um slug só é servida para a URL do mesmo slug.
  O e2e abre A, fica offline, abre B e vê "Sem conexão", nunca o cardápio de A.
- A página aquece o cache depois de mostrar o cardápio (o `index.html`, os
  arquivos já carregados e o próprio cardápio), porque na primeira visita o
  worker ainda não controla a página.
- Na ativação, só os caches de app de versões antigas são apagados. A versão é
  o `release` do build.
- Detalhe que custou um teste: o servidor manda `Vary: Origin` e os scripts de
  módulo pedem com `Origin`; o worker busca no cache com `ignoreVary`.

### Desempenho

- O SDK do Sentry é baixado por `import()` só depois que o roteador termina o
  primeiro carregamento (o cardápio ou a tela de estado na tela) e a página
  pinta. Antes disso, erros entram numa fila e são enviados quando o SDK
  chega. Carregar ao fim da primeira pintura não bastava: o esqueleto de
  carregamento já é uma pintura, e o SDK disputava banda com a API.
- Medição real: o `browserTracingIntegration` registra o `webVitalsIntegration`,
  que é uma cópia do web-vitals dentro do `@sentry/browser-utils` 11.8 (LCP e
  INP com observadores `buffered`, então valem mesmo com o SDK carregado
  depois). Não instalamos o pacote `web-vitals` à parte, para não duplicar
  código. Ligado só no cardápio (`medirDesempenho`), sem dado pessoal (mesma
  limpeza do M01).
- O app usa uma entrada dos contratos sem zod (`@cardapio/contratos/publico`):
  o zod sozinho custava cerca de 26 KB comprimidos no bundle do cliente.
- Imagens: `<picture>` com AVIF e WebP, `width` e `height` (sem salto de
  layout) e `loading="lazy"`. O M07 gera um tamanho só, então a escolha é por
  formato, não por largura.
- Vídeo: só pelo `VideoPrato` do M03 (visíveis tocam, no máximo dois, pausa,
  movimento reduzido e economia de dados). Os destaques usam vídeo; as listas,
  a capa.

### Lighthouse CI

- O `@lhci/cli` não é dependência do projeto: o teste o roda com
  `pnpm dlx @lhci/cli@0.15.1`. Como dependência, ele trazia 7 alertas do
  `pnpm audit` (5 altos, um sem correção em `extract-zip`) em código que só
  roda no CI; fora do lockfile, a auditoria do produto fica limpa.
- `lighthouserc.json`: perfil móvel padrão do Lighthouse com throttling
  simulado (4G lento), 3 execuções, mediana; erro se LCP passar de 2.500 ms ou
  se o JavaScript transferido passar de 170.000 bytes.
- Roda num teste do Playwright marcado `@desempenho` (`pnpm e2e:desempenho`),
  que sobe a mesma pilha do e2e com o build de produção do `cardapio`, semeia
  um restaurante real e mede o link de mesa. No CI, é o job "Desempenho do
  cardápio". O `pnpm e2e` normal pula esse teste.

## Consequências

- Primeira medição local: LCP 2,27 s e 167 KB de JavaScript (incluindo o
  Sentry carregado depois). A folga do JS é pequena: qualquer dependência nova
  no cliente precisa passar por esse orçamento.
- O SDK do Sentry só chega depois do cardápio; um erro antes disso fica na fila
  e é enviado quando o SDK carrega. Se o SDK nunca carregar, esses erros se
  perdem.
- A busca precisa de rede; offline, o app avisa e o cardápio continua.
- A sessão de mesa ainda não é conferida no servidor ao navegar; o M11 confere
  ao pedir.

## Fontes consultadas

- React Router, carregamento de dados: https://github.com/remix-run/react-router/blob/main/docs/start/data/data-loading.md
- React Router, ErrorBoundary: https://github.com/remix-run/react-router/blob/main/docs/how-to/error-boundary.md
- React Router, UI pendente: https://github.com/remix-run/react-router/blob/main/docs/start/framework/pending-ui.md
- MDN, Using Service Workers: https://github.com/mdn/content/blob/main/files/en-us/web/api/service_worker_api/using_service_workers/index.md
- MDN, Autoplay guide (muted, playsinline no Safari): https://github.com/mdn/content/blob/main/files/en-us/web/media/guides/autoplay/index.md
- web-vitals: https://github.com/GoogleChrome/web-vitals
- Lighthouse CI, configuração: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
- `@sentry/browser` 11.8, opções do `browserTracingIntegration`: `node_modules/@sentry/browser/build/npm/types/tracing/browserTracingIntegration.d.ts`
