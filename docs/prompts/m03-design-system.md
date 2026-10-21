# M03: Design system em CSS puro

## Contexto
M00, M01 e M02 aceitos. Existem o monorepo, a observabilidade, o banco
isolado, a tela de erro em `pacotes/ui` e a função `montarAplicacao`.
Ainda não há componentes nem tokens de verdade.

Leia antes: CLAUDE.md; no plano, as seções 4 (UX/UI e design system) e 6
(acessibilidade); e o protótipo, em `docs/referencia/prototipo/`. O
protótipo são 17 telas em `.dc.html` (HTML com estilos inline) e um
LEIA-ME com a lista. Use-o como referência de layout, espaçamento, cores,
textos e estados. Não copie o código: ele depende de um runtime do editor
e usa estilo inline, que é proibido aqui.

## Objetivo
Um pacote `ui` com tokens, tema por restaurante, componentes acessíveis e
cobertos por teste, documentados no Storybook. Daqui em diante, toda tela
dos apps é montada só com esses componentes e tokens.

## Escopo
Dentro:
- Tokens e temas (cardápio, painel e admin, TV).
- Fontes servidas pelo próprio app.
- Lint de CSS e lint de acessibilidade.
- Componentes da lista abaixo, com Storybook e testes.
- Testes visuais com snapshots do Playwright.
- ADR 0007.

Fora:
- Telas dos apps (M06, M09, M13 e seguintes).
- Regras de negócio, como o cálculo de contraste da cor da marca, que é
  validado no servidor (M04) e na prévia da personalização (M14).
- Integração com API.

## Etapa 1: lint de acessibilidade (antes de tudo)
O `eslint-plugin-jsx-a11y` não suporta o ESLint 10 (última versão 6.10.2,
com peer só até o ESLint 9). Pesquisei, e o caminho mais usado é o
`eslint-plugin-jsx-a11y-x`, do grupo es-tooling, com peer
`^9.0.0 || ^10.0.0`. Ele cobre as mesmas regras, salvo a descontinuada
`no-onchange`, e as regras passam a ter o prefixo `jsx-a11y-x/`. Na versão
0.2.0, as definições de tipo vinham incompletas, e houve projetos que
precisaram de um patch do pnpm. O projeto ttoss trocou para ele junto com
o `@eslint-react/eslint-plugin` e o `eslint-plugin-import-x`.

1. Confirme no npm e no repositório a versão atual, a manutenção (data do
   último release e issues abertas) e se as definições de tipo já foram
   corrigidas.
2. Se estiver bom, adote com a configuração recomendada, sem desligar
   regras. Se precisar de patch, registre no ADR 0007 com o link da issue.
3. Avalie também o `@eslint-react/eslint-plugin` para as regras de React,
   já que o M00 não tem lint de React. Se for maduro e suportar o ESLint 10,
   adote.
4. Se nenhum servir, pare e me traga as opções. O lint de acessibilidade é
   obrigatório.

Fontes da minha pesquisa:
https://github.com/upleveled/eslint-config-upleveled/pull/707 e
https://github.com/ttoss/ttoss/pull/1323

## Antes de codar (demais itens)
Confira na documentação oficial e cite as URLs no PR:
1. Storybook 10 com Vite e React: `@storybook/addon-vitest` (que roda as
   histórias como testes) e `@storybook/addon-a11y` (axe). A versão 10.3
   anuncia suporte a Vite 8 e ESLint 10.
2. Playwright: `toHaveScreenshot`, limites de diferença e a imagem Docker
   oficial, para gerar snapshots sempre no mesmo ambiente.
3. Stylelint: configuração padrão e uma regra (plugin ou nativa) que exija
   `var()` em propriedades de cor.
4. Fontes por pacote (`@fontsource` ou `@fontsource-variable`) para
   Bricolage Grotesque, DM Sans, Poppins e Open Sans, com subconjunto
   latino e `font-display: swap`.
5. Ícones: `lucide-react` (licença, tamanho e importação individual).
6. `<dialog>` nativo com `showModal()`: suporte nos navegadores-alvo
   (Safari do iPhone, Chrome do Android) e comportamento de foco.

## Decisões já tomadas
- CSS Modules e variáveis CSS. Proibido Tailwind e qualquer framework ou
  biblioteca de CSS em JS.
- Fontes servidas pelo próprio app, nunca pelo Google Fonts. Isso evita
  enviar o IP do cliente a terceiros (LGPD) e tira uma conexão do caminho
  do carregamento.
- Ícones do `lucide-react`, sempre por trás de um componente `Icone`
  próprio, para trocar de biblioteca sem mexer nas telas. Nunca emoji.
- Folhas e diálogos com o `<dialog>` nativo, sem biblioteca de primitivos,
  se a etapa 6 de "Antes de codar" confirmar o suporte. Se não confirmar,
  me traga a alternativa.
- O tema do restaurante entra por exatamente três variáveis no elemento
  raiz: `--cor-marca`, `--cor-sobre-marca` e `--cor-marca-texto`. Os valores
  chegam prontos e validados pela API. O `ui` não calcula contraste.
- Testes visuais com snapshots do Playwright sobre o Storybook estático,
  gerados e comparados sempre dentro da imagem Docker oficial do
  Playwright, para não variar entre máquinas.

## Tokens (pacotes/ui/src/tokens.css)
Parta do bloco da seção 4 do plano e complete:
- Cores base, de estado, de borda, de foco e de marca, todas como variável.
- Tipografia: `--fonte-titulo`, `--fonte-texto` e a escala `--tamanho-1` a
  `--tamanho-6`, em rem. Corpo com 16 px no mínimo.
- Espaçamento de `--espaco-1` a `--espaco-7`, raios, `--alvo-toque` (44 px),
  sombra (se houver, só uma) e `--duracao`.
- `[data-tema='painel']`: marca WebEsfera (`#00C2CB` com texto `#303642`),
  Poppins e Open Sans. O admin usa o mesmo tema.
- `[data-tema='tv']`: fundo `#0B0F14`, texto `#F2F4F7` e estados `#F97066`,
  `#FDB022` e `#47CD89`, com texto de 24 px no mínimo.
- `@media (prefers-reduced-motion: reduce)` zera `--duracao`.
- Nenhuma cor hexadecimal pode aparecer fora deste arquivo.

`pacotes/ui/src/tema/aplicar-tema.ts`: `aplicarTemaRestaurante(elemento,
{ corMarca, corSobreMarca, corMarcaTexto })`. Valida o formato hexadecimal
dos três valores e, se algum for inválido, mantém o tema padrão e reporta
pelo `reportarErroWeb`, sem quebrar a tela.

(Ajuste do John em 2026-10-21: o `ui` não importa a observabilidade. A
assinatura é `aplicarTemaRestaurante(elemento, tema, reportar)`, com
`reportar` obrigatório e do tipo próprio
`ReportarErro = (erro: unknown, extra?: Record<string, unknown>) => void`.
Os apps passam `reportarErroWeb`; Storybook e testes passam uma espiã. O
teste confirma que, com valor inválido, o tema padrão é mantido e `reportar`
é chamado uma vez, com o código do erro e o campo inválido.)

## Componentes
Cada componente tem: arquivo `.tsx`, `.module.css`, história no Storybook
com todos os estados e teste de comportamento. Nomes em português.

| Componente | Estados e regras |
| --- | --- |
| `Botao` | principal, secundario, perigo, texto; normal, foco, carregando (com `aria-busy`), desativado; tamanho mínimo `--alvo-toque` |
| `LinkBotao` | `<a>` com a aparência do `Botao`, para navegação |
| `CampoTexto`, `AreaTexto`, `Seletor` | rótulo visível obrigatório (a prop é exigida pelo tipo), dica, erro ligado por `aria-describedby`, `aria-invalid`, desativado |
| `Caixa` e `Radio` | rótulo clicável com 44 px de alvo; grupo de radios em `fieldset` com `legend` |
| `Icone` | nomes de um mapa fixo, tamanhos 16, 20 e 24, `aria-hidden` por padrão; com `rotulo`, vira `role="img"` |
| `BotaoIcone` | só ícone; a prop `rotulo` (vira `aria-label`) é obrigatória pelo tipo |
| `VideoPrato` | ver regras abaixo |
| `CartaoPrato` | normal, destaque, esgotado (desativado, com o motivo em texto) |
| `ChipCategoria` e `FiltroChip` | selecionado com `aria-pressed`; navegação por teclado |
| `SeletorQuantidade` | mínimo e máximo, botões com rótulo ("Diminuir Costela na brasa") e valor anunciado por `aria-live` |
| `FolhaInferior` | `<dialog>` modal; abre com foco no primeiro elemento; Esc fecha; o foco volta para quem abriu; o fundo fica inerte |
| `SeloSituacao` | aguardando, em atendimento, concluído, cancelado, vencida, paga; a cor nunca é o único sinal (sempre há texto) |
| `ItemFila` | novo, assumido, atrasado; versão do tema TV |
| `Aviso` | informação, sucesso, aviso, erro; `role="status"` ou `role="alert"`, conforme a gravidade |
| `Toast` e `ProvedorDeToast` | região `aria-live` única; some sozinho só se não for erro; dá para fechar pelo teclado |
| `Tabela` | cabeçalhos com `scope`, rolagem lateral num contêiner com rótulo, estados vazio e carregando |
| `Esqueleto` | bloco de carregamento com `aria-hidden` e um texto equivalente para leitor de tela |
| `TelaErro` | a do M01, migrada para os tokens finais |

### Regras do VideoPrato
1. Elemento `<video>` com `muted`, `playsinline`, `loop`, `preload="none"`
   e `poster`.
2. Só toca quando 60% ou mais está visível (IntersectionObserver).
3. No máximo 2 vídeos tocando ao mesmo tempo na tela, controlados por um
   contexto `CoordenadorDeVideos`; o mais antigo pausa.
4. Com `prefers-reduced-motion` ou economia de dados
   (`navigator.connection.saveData`), não toca sozinho: mostra a capa e o
   botão "Reproduzir".
5. Botão de pausa sempre visível, com rótulo ("Pausar vídeo do prato").
6. Se o vídeo falhar, fica a capa, sem mensagem de erro.
7. Sem dependência de API: recebe `fonteMp4`, `fonteWebm` (opcional), `capa`
   e `descricao`.

## Lint de CSS (stylelint)
- Configuração padrão.
- Cores (`color`, `background`, `background-color`, `border-color`,
  `outline-color`, `fill` e `stroke`) só por `var()`, exceto em
  `tokens.css`.
- Proibido `!important` e seletor de id.
- Roda em `pnpm verificar` e no CI.

## Testes obrigatórios
- Contraste dos tokens: um teste calcula a razão de contraste de cada par
  usado de verdade (texto sobre fundo, texto secundário, texto sobre
  superfície, borda de campo, foco, estados, marca WebEsfera, tema TV) e
  falha abaixo de 4,5:1 para texto e 3:1 para borda, foco e ícone.
- Todo componente: história com todos os estados, e o addon de testes do
  Storybook roda todas as histórias com o axe, sem violação.
- `FolhaInferior`: o foco entra, Esc fecha, o foco volta para quem abriu e
  o fundo fica inerte.
- `VideoPrato`: toca só com 60% visível; limite de 2 simultâneos; não toca
  sozinho com movimento reduzido nem com economia de dados; na falha,
  fica a capa; a pausa funciona pelo teclado.
- `SeletorQuantidade`: respeita os limites e anuncia o valor.
- `aplicarTemaRestaurante`: aplica os três valores válidos; com valor
  inválido, mantém o padrão e reporta.
- Lint: um CSS de exemplo com cor hexadecimal fora dos tokens faz o
  stylelint falhar; um `<div onClick>` faz o lint de acessibilidade falhar.
- Snapshots visuais de cada história nos temas cardápio, painel e TV, a
  360 px e a 1280 px, gerados na imagem Docker do Playwright.

## Critério de pronto
- `pnpm verificar` verde, com stylelint, lint de acessibilidade, testes do
  Storybook e o teste de contraste.
- O job de snapshots visuais roda no CI. Na primeira vez, gere a base de
  snapshots e mostre no PR.
- `pnpm storybook` abre localmente; `pnpm storybook:build` gera o estático.
- No PR, prints de 4 histórias (Botao, CartaoPrato, VideoPrato e
  FolhaInferior) nos três temas.

## ADR 0007: Design system
Registre: a escolha do lint de acessibilidade (e o patch, se houver);
fontes servidas pelo app; ícones atrás do `Icone`; o `<dialog>` nativo;
o contrato das três variáveis do tema; a regra das cores no stylelint;
os testes visuais no Docker; e como acrescentar um componente novo.

## Proibido
Tailwind ou qualquer CSS em JS; cor fora de `tokens.css`; estilo inline,
salvo as três variáveis do tema; `onClick` em `div` ou `span`; emoji;
Google Fonts por CDN; desligar regra de acessibilidade; componente sem
história ou sem teste.

## Entrega
Branch da sessão, atualizada a partir da main. Commits por assunto: lint
de acessibilidade e de React, tokens e temas, fontes e ícones,
componentes de formulário, componentes do cardápio, componentes do
painel, Storybook e testes visuais, docs. PR com título
`feat: design system em CSS puro (M03)` e descrição com: o que foi criado;
as versões e URLs consultadas; os prints; riscos; e sugestões para os
próximos módulos.
