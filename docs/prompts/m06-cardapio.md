# M06: Gestão do cardápio

## Contexto

M00 a M05 aceitos: isolamento, design system, identidade e restaurantes, filas e outbox. O dono já tem conta, restaurante e sessão de painel. Ainda não há cardápio.

Leia antes: CLAUDE.md; ADRs 0006, 0007, 0008 e 0009; no plano, a seção 1 (RF02), a seção 3 (tabelas `categorias` e `pratos`, busca com `unaccent`) e a seção 4; e as telas `Main.dc.html`, `Busca.dc.html`, `Prato.dc.html` e `Fechado.dc.html` do protótipo (referência de layout e estados, não de código).

## Objetivo

O dono monta o cardápio no painel: categorias e pratos, com preço, descrição, disponibilidade, destaque e ordem. O cliente lê o cardápio publicado e busca sem acento. Aqui ainda sem vídeo (M07) e sem a tela do cliente montada (M09): esta entrega expõe os dados e as telas do painel.

## Escopo

Dentro:

- Domínio: `Categoria`, `Prato`, `Dinheiro` (centavos), `Cardapio`.
- Casos de uso do painel: criar, editar, reordenar e remover categoria; criar, editar, marcar esgotado, destacar, reordenar e remover prato. Edição com trava otimista (`versao`).
- Caso de uso de leitura: `ObterCardapioPublicado(restauranteId)`, com cache no Redis e invalidação ao publicar.
- Busca: `BuscarPratos(restauranteId, termo)`, sem acento, por nome, descrição e categoria.
- Migração das colunas que faltam em `categorias` e `pratos` (campo de mídia fica anulável; preenchido no M07).
- API: rotas do painel (sessão de dono ou gerente) e a rota pública de leitura do cardápio e de busca (sem sessão, por slug, com limite de taxa e cache).
- Painel: telas de cardápio e de edição de prato, com os componentes do `ui`.

Fora: upload e vídeo (M07); a tela do cliente montada (M09); pedido (M11).

## Antes de codar

Confira na documentação oficial e cite as URLs no PR:

1. PostgreSQL: `unaccent` (extensão e imutabilidade para índice), `tsvector`/`tsquery` com dicionário sem acento, `websearch_to_tsquery`, e índice GIN. Decida entre coluna `tsvector` gerada e índice funcional, e registre no ADR.
2. Reordenação estável: estratégia de `ordem` (inteiros com espaçamento, ou chave fracionária) que não exija reescrever todas as linhas a cada arrastar. Escolha e justifique.
3. Drizzle: `generatedAlwaysAs` para coluna gerada, se for usar.

## Decisões já tomadas

- Preço em centavos, inteiro, calculado e guardado no servidor. Nunca float. O domínio `Dinheiro` formata para exibição (R$ 0,00).
- Edição com trava otimista: toda alteração manda a `versao` que leu; se mudou, devolve `ErroDeNegocio` de conflito e a tela recarrega.
- Esgotado é um campo (`disponivel=false`), não remoção. Prato esgotado aparece no cardápio marcado, e no M11 não entra no carrinho.
- Remover prato é soft delete (marcado como removido), porque ele pode estar em pedidos antigos. Não aparece no cardápio.
- Cardápio publicado: montado por uma consulta só, guardado no Redis com a chave versionada da seção 3, invalidado ao publicar qualquer mudança. Chave sempre pela função `chavesRedis`, com o `restaurante_id`.
- Rota pública por slug: resolve o restaurante pelo slug (ou pelo histórico, redirecionando), nunca recebe `restaurante_id`. Respeita a situação: restaurante cancelado não serve cardápio; fechado serve o cardápio com uma marca de fechado (o horário vem do M04).
- Busca: ignora acento e maiúsculas, casa nome, descrição e categoria, ordena por relevância e depois por ordem do cardápio. Prato removido nunca aparece; esgotado aparece marcado.
- Limite de descrição e de nome definidos e validados por Zod nos dois lados.

## Testes obrigatórios

- `Dinheiro`: soma, formatação, rejeita negativo e não inteiro.
- Trava otimista: duas edições concorrentes, a segunda recebe conflito.
- Isolamento: as telas e rotas de A nunca leem ou alteram o cardápio de B; as tabelas passam nos testes 1 a 8 do M02 sem mudar o M02.
- Cache: publicar invalida a chave; a leitura seguinte reflete a mudança; a chave sempre leva o `restaurante_id`.
- Busca: "costela" acha "Costela"; "abobora" acha "abóbora"; termo sem resultado devolve vazio; removido não aparece; esgotado aparece marcado.
- Reordenação: arrastar um prato muda só o necessário e a ordem fica estável depois de várias trocas.
- Rota pública: cancelado dá 404; fechado traz a marca; slug do histórico redireciona; limite de taxa responde 429.
- Telas no Chromium, com axe: criar categoria, criar prato, marcar esgotado, reordenar, e o conflito de versão recarregando.

## Critério de pronto

`pnpm verificar` e CI verdes; demonstração no PR com um cardápio de exemplo criado pela API, a leitura pública e a busca sem acento; ADR 0010 (cardápio e busca) escrito.

## Proibido

Preço em float ou vindo do cliente; remover prato de verdade (hard delete); cache sem `restaurante_id`; `restaurante_id` vindo do cliente na rota do painel; busca que mostra removido; emoji.

## Entrega

Branch da sessão, atualizada a partir da main. Commits por assunto. PR `feat: gestão do cardápio (M06)`, com o que foi criado, URLs, demonstração, riscos e sugestões.
