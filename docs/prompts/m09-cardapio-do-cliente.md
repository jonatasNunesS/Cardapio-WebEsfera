# M09: Cardápio do cliente
 
## Contexto
M00 a M08 aceitos. O cliente já recebe uma sessão de mesa pela rota da API, o cardápio público (com vídeo e imagens) já é servido por slug, a busca sem acento existe, e o design system tem `VideoPrato`, `CartaoPrato`, busca, folhas e estados. Falta montar o app do cliente de verdade.
Leia antes: CLAUDE.md; ADRs 0007, 0010, 0011 e 0012; no plano, as seções 1 (RF01, RF02, RF07), 4, 6 e 9 (LCP até 2,5 s no 4G); e as telas `Entrada.dc.html`, `Main.dc.html`, `Busca.dc.html`, `Prato.dc.html`, `Fechado.dc.html`, `QrInvalido.dc.html` e `SemConexao.dc.html`.
## Objetivo
O app `cardapio` montado: o cliente abre o link do QR, recebe a sessão de mesa, vê a abertura, o cardápio com vídeo girando, o prato, a busca, e os estados de fechado, QR inválido, sessão expirada e sem conexão. Rápido no 4G. Ainda sem carrinho e pedido (M11) e sem chamar garçom (M12): esta entrega é só ver o cardápio e abrir a sessão.
## Escopo
Dentro:

* A rota `/{slug}/mesa/{numero}` no app do cardápio, que abre a sessão de mesa (consome a rota do M08) e carrega o cardápio.
* Telas: abertura, cardápio (categorias, destaque, lista), prato com vídeo, busca, fechado, QR inválido, sessão expirada.
* Tema do restaurante aplicado pelas três variáveis (cor da marca), com os valores que vêm do cardápio público.
* Desempenho: vídeo só dos pratos visíveis, imagens com `srcset`, SDK do Sentry carregado depois da primeira renderização (do M01), orçamento de JavaScript respeitado.
* Cache offline do cardápio (service worker) para reabrir com rede ruim.
* ADR 0013.

Fora: carrinho, pedido, observação (M11); chamar garçom, conta, avaliar no Google (M12); a rota pública só de vitrine sem mesa (não faz parte do produto; o link sempre tem mesa).
## Antes de codar
Confira na documentação oficial e cite as URLs no PR:

1. React Router: carregamento de dados por rota e estados de carregando e erro.
2. Service worker com Vite (por exemplo `vite-plugin-pwa` ou um worker escrito à mão): cache do cardápio (app shell e dados), estratégia e invalidação; o que NUNCA cachear (nada de dado de outra mesa; só o cardápio público daquele restaurante).
3. Medição de LCP e INP reais no cliente (web-vitals), para o orçamento.
4. Autoplay de vídeo mudo no Safari do iPhone e no Chrome do Android (`muted`, `playsinline`), e o que muda quando o navegador abre a partir do leitor de QR.

## Decisões já tomadas

* O app nunca recebe `restaurante_id`. Ele tem slug, número e código na URL; a abertura da sessão é feita pela rota do M08, que resolve e devolve os dados.
* A sessão de mesa fica no cookie assinado do M08. O app não guarda segredo nenhum no armazenamento local.
* A abertura segue o protótipo: carrega mostrando a marca, depois a tela de boas-vindas com "Você está na Mesa N" e os botões; é possível pular a animação. Avalie mostrá-la só no primeiro acesso da sessão (uma marca no `sessionStorage`), para não atrasar o prato nas próximas vezes.
* Vídeo: usa o `VideoPrato` do `ui`, com as regras já testadas (só visíveis tocam, máximo 2, pausa, movimento reduzido, economia de dados).
* Fechado: cardápio visível, sem ação de pedir (que nem existe ainda); mostra o horário. QR inválido e sessão expirada: as telas neutras do M08, sem a marca do restaurante.
* Sem conexão: o cardápio reabre do cache; um aviso diz que está offline.
* Tema: aplica as três variáveis com `aplicarTemaRestaurante` (M03), com os valores do cardápio. Se vierem inválidos, tema padrão (já tratado no M03).
* Idioma, alérgenos e "mais buscados" ficam para a V1.1.

## Desempenho (metas da seção 9)

* LCP até 2,5 s no 4G (p75); JavaScript da rota do cardápio até 170 KB comprimidos; cada vídeo carrega só quando visível.
* Mede LCP e INP reais e manda ao Sentry como métrica (sem dado pessoal).
* O Sentry do cliente carrega depois da primeira renderização, para não pesar no LCP (decisão registrada no M01 para cá).

## Testes obrigatórios

* Abrir `/{slug}/mesa/{numero}` com código válido: abre a sessão, mostra a abertura e o cardápio; a abertura some nos acessos seguintes da mesma sessão.
* Código inválido, mesa inativa, restaurante cancelado: tela de QR inválido, sem a marca; nada vaza.
* Slug ou número antigos: redireciona para o link atual e abre normal.
* Sessão expirada: tela própria, com o caminho de escanear de novo.
* Fechado: cardápio visível, horário, sem ação de pedido.
* Busca: "abobora" acha "abóbora"; vazio quando não há; esgotado aparece marcado; removido não aparece.
* Vídeo: só os visíveis tocam; com movimento reduzido, só a capa.
* Tema: a cor do restaurante é aplicada; cor inválida cai no padrão.
* Offline: com o cardápio já carregado, recarregar sem rede mostra o cardápio do cache e o aviso de offline.
* Isolamento: o cache de um restaurante nunca serve outro; trocar de mesa ou de restaurante não mistura dados.
* e2e no Chromium com axe em cada estado; LCP dentro do orçamento no teste de desempenho (Lighthouse CI).

## Critério de pronto
`pnpm verificar` e CI verdes; demonstração no PR: abrir um link de mesa real, navegar do cardápio ao prato, buscar, e recarregar offline; o relatório de LCP e do tamanho do JavaScript da rota. ADR 0013 escrito.
## Proibido
`restaurante_id` no cliente; segredo no armazenamento local; cache que cruza restaurantes ou mesas; Sentry no caminho do LCP; vídeo tocando fora da regra do `VideoPrato`; emoji.
## Entrega
Branch da sessão, atualizada a partir da main. Commits por assunto. PR `feat: cardápio do cliente (M09)`, com o que foi criado, URLs, demonstração, o LCP e o tamanho do JS, riscos e sugestões.
