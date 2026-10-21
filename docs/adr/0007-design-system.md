# ADR 0007: Design system em CSS puro

- Situação: aceita (M03)
- Data: 2026-10-21

## Contexto

O plano (seção 4) pede um design system em CSS puro, com tokens em variáveis
CSS, componentes React com CSS Modules e um único ponto de entrada para a cor
de cada restaurante. A seção 6 pede WCAG 2.2 AA, lint de acessibilidade a cada
commit e axe nos testes de componente. Daqui em diante, toda tela é montada só
com os componentes e os tokens de `pacotes/ui`.

A referência visual é o protótipo do Claude Design, em
`docs/referencia/prototipo` (código das 17 telas e uma captura de cada uma).

| Pacote                                                                               | Versão  |
| ------------------------------------------------------------------------------------ | ------- |
| eslint-plugin-jsx-a11y-x                                                             | 0.2.0   |
| @eslint-react/eslint-plugin                                                          | 5.28.2  |
| stylelint                                                                            | 17.16.0 |
| stylelint-config-standard                                                            | 40.0.0  |
| stylelint-declaration-strict-value                                                   | 1.12.1  |
| storybook, @storybook/react-vite, addon-vitest, addon-a11y                           | 10.6.3  |
| @vitest/browser-playwright                                                           | 5.0.5   |
| @playwright/test e imagem `mcr.microsoft.com/playwright`                             | 1.64.1  |
| @fontsource-variable (Bricolage Grotesque, DM Sans, Open Sans) e @fontsource/poppins | 5.3.0   |
| lucide-react                                                                         | 1.60.0  |

As versões mais novas publicadas há menos de um dia (eslint-react 5.28.4 e
lucide-react 1.61.0) foram recusadas pela política de idade mínima do pnpm. Não
abrimos exceção: ficamos na anterior.

## Decisões

### Lint de acessibilidade

- O `eslint-plugin-jsx-a11y` (6.10.2) não aceita o ESLint 10. Adotamos o
  `eslint-plugin-jsx-a11y-x` 0.2.0, com `configs.recommended`. Ele aceita
  ESLint 9 e 10, tem commits em 14/10/2026 e passou para a organização
  eslint-community.
- As definições de tipo da 0.2.0 trazem só `configs`, sem `meta` nem `rules`.
  A correção (PR #106, https://github.com/es-tooling/eslint-plugin-jsx-a11y-x/pull/106)
  está no ramo principal, mas ainda não saiu em versão. Como usamos só
  `configs.recommended`, não precisamos de patch nem de conversão de tipo.
- Uma regra ganhou opção, sem ser desligada: `no-noninteractive-tabindex`
  aceita, além de `tabpanel` (o padrão), o papel `region`. A tabela com
  rolagem lateral fica num contêiner `role="region"`, rotulado e com
  `tabIndex={0}`, porque sem foco quem usa só teclado não consegue rolar
  (regra `scrollable-region-focusable` do axe).
- Regras de React: `@eslint-react/eslint-plugin` com o preset
  `recommended-type-checked`. Ele exige ESLint 10 e já inclui
  `rules-of-hooks`, então não usamos o `eslint-plugin-react-hooks`.
- Estilo inline em JSX é proibido por `no-restricted-syntax` (atributo
  `style`). O tema do restaurante entra por `aplicarTemaRestaurante`, que usa
  `style.setProperty`, não JSX.
- Provas: `pacotes/config/eslint/acessibilidade.test.ts` (um `<div onClick>`
  falha, uma imagem sem `alt` falha, um `style` falha, um `button` passa).

### Lint de CSS

- `stylelint-config-standard`, mais:
  - `scale-unlimited/declaration-strict-value` em `color`, `background`,
    `background-color`, `border-color`, `outline-color`, `fill` e `stroke`, com
    funções proibidas: só `var()` (e `currentcolor`, `transparent`, `inherit`,
    `none`);
  - `color-no-hex` e `color-named: never` em todo lugar, menos em
    `pacotes/ui/src/tokens.css`;
  - `declaration-no-important`, `selector-max-id: 0` e classes em camelCase
    (viram propriedades do CSS Module).
- Roda em `pnpm lint` (portanto em `pnpm verificar` e no CI). Prova:
  `pacotes/config/stylelint/cores.test.ts`.

### Tokens e temas

- `pacotes/ui/src/tokens.css` parte do bloco da seção 4 do plano e completa
  cores (superfície suave, esqueleto, texto inverso, informação, neutro,
  sobreposição), pesos, alturas de linha, bordas, foco, uma sombra e
  `--duracao`.
- `[data-tema='painel']` (painel e admin): marca WebEsfera `#00C2CB` com texto
  `#303642`, Poppins e Open Sans. `--cor-marca-texto` é `#303642`: o ciano como
  texto sobre branco dá 2,2:1. O protótipo usa o ciano só como fundo; o ciano
  como borda ou indicador também não passa (2,0:1), então nunca é o único sinal
  de estado no painel.
- `[data-tema='tv']`: fundo `#0B0F14`, texto `#F2F4F7`, estados `#F97066`,
  `#FDB022` e `#47CD89`, e a escala tipográfica toda em 24 px ou mais.
- `prefers-reduced-motion: reduce` zera `--duracao`; as animações (carregando,
  esqueleto) param.
- `pacotes/ui/src/tokens.test.ts` calcula a razão de contraste de cada par
  usado nos três temas: 4,5:1 para texto, 3:1 para borda de campo, foco e
  ícone. Trocar um token por uma cor fraca faz o teste falhar (conferido).

### Tema do restaurante e relator injetado

- O tema entra por exatamente três variáveis no elemento raiz:
  `--cor-marca`, `--cor-sobre-marca` e `--cor-marca-texto`. Os valores chegam
  prontos e validados pela API; o `ui` não calcula contraste.
- `aplicarTemaRestaurante(elemento, tema, reportar)` confere o formato
  `#RRGGBB` dos três valores. Com qualquer um inválido, remove as três
  variáveis (fica o tema padrão), chama `reportar` uma vez com
  `ErroTemaInvalido` e `{ codigo: 'UI_TEMA_COR_INVALIDA', campo }`, e devolve
  `false`. A tela não quebra.
- Regra (decisão do John em 2026-10-21): **o `ui` nunca reporta sozinho.**
  Quem precisa reportar recebe a função por parâmetro, com o tipo próprio
  `ReportarErro = (erro: unknown, extra?: Record<string, unknown>) => void`.
  Os apps passam `reportarErroWeb`; Storybook e testes passam uma espiã. Assim
  a regra 6 do ADR 0002 (o `ui` não importa nada do monorepo) continua valendo
  e o Storybook não carrega o SDK do Sentry.

### Fontes servidas pelo app

- Nunca Google Fonts por CDN: isso enviaria o IP do cliente a terceiros (LGPD)
  e acrescentaria uma conexão ao carregamento.
- `pacotes/ui/src/fontes/cardapio.css` (Bricolage Grotesque e DM Sans,
  variáveis) e `fontes/painel.css` (Poppins 400, 600 e 700, e Open Sans
  variável) declaram `@font-face` próprios, só com o arquivo latino de cada
  família e `font-display: swap`. Importar o CSS do Fontsource inteiro levaria
  também cirílico, grego e vietnamita para o build.
- O cardápio importa `@cardapio/ui/fontes/cardapio.css`; painel e admin
  importam `fontes/painel.css` e põem `data-tema="painel"` no `<html>`. O build
  do cardápio leva dois `.woff2` (37 KB e 41 KB).

### Ícones atrás do `Icone`

- `lucide-react` (licença ISC) declara `sideEffects: false`; a importação pelo
  nome (`import { Search } from 'lucide-react'`) leva só os ícones usados.
- Ninguém importa o `lucide-react` direto: o `Icone` recebe um nome de um mapa
  fixo em português (`icones.ts`), tamanhos 16, 20 ou 24, é `aria-hidden` por
  padrão e vira `role="img"` com `rotulo`. Trocar de biblioteca é trocar o mapa.

### Folhas e diálogos com `<dialog>` nativo

- Suporte: `showModal()` existe desde o Chrome 37 e o Safari 15.4, com as
  mesmas versões no Chrome do Android e no Safari do iPhone (dados do MDN,
  https://github.com/mdn/browser-compat-data, `api/HTMLDialogElement.json`).
  `closedBy` ainda não está no Safari, então não dependemos dele.
- `FolhaInferior` é controlada: abre com `showModal()` (o resto da página fica
  inerte pelo próprio navegador), foca o primeiro elemento focável, e o Esc e o
  evento `cancel` (inclui o gesto de voltar do Android) chamam `aoFechar` em vez
  de fechar por conta própria. Ao fechar, o foco volta para quem abriu.
- O jsdom não implementa `showModal`. Por isso os testes de comportamento da
  folha (foco entra, Esc fecha, foco volta, fundo inerte) são `play` das
  histórias e rodam no Chromium pelo addon de testes do Storybook.

### Storybook e axe

- Storybook 10.6.3 com `@storybook/react-vite` e o addon de testes no Vitest
  (`@storybook/addon-vitest`), que roda cada história como teste no Chromium
  em modo navegador. `parameters.a11y.test = 'error'`: violação do axe reprova
  a história (conferido com um botão sem nome).
- O Vitest tem um projeto por tema (`storybook-cardapio`, `storybook-painel`,
  `storybook-tv`). O tema entra por `TEMA_DA_PREVIA` nos `globals` iniciais da
  prévia. Assim o axe, inclusive o contraste, roda em toda história nos três
  temas.
- Localmente, sem o Chromium da versão do Playwright, `CAMINHO_CHROMIUM`
  aponta para outro executável. No CI, `playwright install --with-deps
chromium`.
- As mídias de exemplo (`pacotes/ui/.storybook/midia`) são uma capa ilustrada e
  um vídeo de 2 s com todos os quadros iguais, gerados aqui. Assim o snapshot
  de um vídeo tocando é estável.

### Testes visuais no Docker

- `@playwright/test` com `toHaveScreenshot` sobre o Storybook estático: cada
  história do `index.json`, nos temas cardápio, painel e TV, a 360 e a 1280 px
  (378 imagens na primeira base). A captura espera o fim da renderização e do
  `play` (`__STORYBOOK_PREVIEW__.currentRender.phase`) e o carregamento das
  fontes. Animações desligadas, cursor oculto, tolerância de 0,2% dos pixels.
- A base é gerada e comparada sempre na imagem oficial
  `mcr.microsoft.com/playwright:v1.64.1-noble`, na mesma versão do
  `@playwright/test` (um teste confere que o CI usa a mesma imagem):
  - local: `pnpm visual` compara e `pnpm visual:atualizar` regrava a base;
    os dois copiam o repositório, sem `node_modules`, para dentro do contêiner;
  - CI: job `visual`, que roda dentro da imagem e publica o relatório e as
    diferenças como artefato quando falha.
- Fontes: https://playwright.dev/docs/test-snapshots,
  https://playwright.dev/docs/docker,
  https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1.

### Convenções do pacote

- Um componente por pasta em `pacotes/ui/src/componentes/<nome>`: `.tsx`,
  `.module.css`, `.stories.tsx` e `.test.tsx`.
- Props opcionais declaradas como `?: T | undefined`, por causa do
  `exactOptionalPropertyTypes`.
- `juntarClasses` para combinar classes; `tons.module.css` para os tons de
  informação, sucesso, aviso, erro e neutro; `oculto.module.css` para texto só
  de leitor de tela.
- Componentes interativos usam elementos nativos. Botões em estado
  "carregando" ou no limite (quantidade) usam `aria-disabled` e não `disabled`,
  para não perder o foco.

## Como acrescentar um componente novo

1. Criar a pasta em `pacotes/ui/src/componentes/<nome-em-kebab>` com o `.tsx`
   (nome em português, props tipadas), o `.module.css` (só tokens), a história
   (`title` com o grupo: Formulario, Cardapio, Painel ou Compartilhados) com
   todos os estados, e o teste de comportamento.
2. Comportamento que o jsdom não cobre (diálogo, foco real, mídia) vai como
   `play` na história, que roda no Chromium.
3. Exportar no `pacotes/ui/src/index.ts`.
4. Rodar `pnpm verificar`. Se a história nova reprovar no axe em algum tema,
   corrigir o componente, nunca a regra.
5. Rodar `pnpm visual:atualizar`, conferir as imagens novas e versionar junto.
6. Cor, espaço ou tamanho que não existe nos tokens entra primeiro em
   `tokens.css`, e o par de contraste novo entra em `tokens.test.ts`.

## Consequências

- Uma cor fora dos tokens, um `!important`, um `style` em JSX, um `<div
onClick>` ou uma história com violação do axe em qualquer tema quebram o CI.
- Toda mudança visual aparece como diferença de imagem no PR e exige regravar a
  base no Docker.
- O job visual leva cerca de 4 minutos. Se a base crescer muito, vale separar
  por componente alterado.

## Documentação consultada

- eslint-plugin-jsx-a11y-x: https://github.com/es-tooling/eslint-plugin-jsx-a11y-x
  e https://www.npmjs.com/package/eslint-plugin-jsx-a11y-x
- ESLint React: https://github.com/Rel1cx/eslint-react e https://eslint-react.xyz
- Storybook:
  https://storybook.js.org/docs/writing-tests/integrations/vitest-addon,
  https://storybook.js.org/docs/writing-tests/accessibility-testing e
  https://storybook.js.org/docs/get-started/frameworks/react-vite (lidos em
  https://github.com/storybookjs/storybook, pasta `docs`)
- Stylelint: https://stylelint.io/user-guide/configure,
  https://github.com/stylelint/stylelint-config-standard e
  https://github.com/AndyOGo/stylelint-declaration-strict-value
- Fontsource: https://fontsource.org/docs/getting-started/install
- Lucide: https://lucide.dev/guide/packages/lucide-react
- `<dialog>`: https://developer.mozilla.org/docs/Web/HTML/Element/dialog
- axe, região rolável focável:
  https://dequeuniversity.com/rules/axe/4.14/scrollable-region-focusable
