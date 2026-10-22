# ADR 0010: Cardápio e busca

- Situação: proposta (M06)
- Data: 2026-10-22

## Contexto

O M06 cria o cardápio: o dono monta categorias e pratos no painel, e o
cliente lê o cardápio publicado e busca sem acento. As regras do prompt
(`docs/prompts/m06-cardapio.md`) valem como requisito. O prompt falava em
"colunas que faltam" em `categorias` e `pratos`, mas as tabelas não existiam:
a migração `0009_cardapio.sql` cria as duas, com RLS forçado e fábricas de
teste, e o catálogo do M02 (testes 1 a 8) passa sem mudança.

Decisões do John antes de codar (2026-10-22):

- Salvar publica na hora; não há rascunho.
- A busca casa por prefixo ("cost" acha "Costela").
- Restaurante sem horário cadastrado conta como aberto.
- Categoria com prato ativo não pode ser removida.

| Componente  | Versão |
| ----------- | ------ |
| PostgreSQL  | 18.6   |
| drizzle-orm | 0.45.4 |

## Decisões

### Busca: coluna tsvector gerada, sem acento, com a categoria por junção

- A extensão `unaccent` fica no esquema `extensoes`. Ela é confiável
  (trusted), então o `cardapio_dono`, que tem `CREATE` no banco, cria a
  extensão na migração; o script de inicialização não mudou.
- `unaccent()` é `STABLE`, e coluna gerada e índice exigem função imutável.
  A função `app.sem_acento(texto)` chama `unaccent` com o dicionário explícito
  e é marcada `IMMUTABLE`. Com o dicionário fixo, o resultado não muda.
- `pratos.busca` é uma coluna `tsvector` gerada (`STORED`): o nome com peso A
  e a descrição com peso B, no dicionário `portuguese`, já sem acento. O
  índice GIN fica sobre essa coluna.
- Coluna gerada em vez de índice funcional: o vetor é calculado uma vez, na
  escrita; a consulta usa a coluna pelo nome, sem repetir a expressão do
  índice; e o custo de espaço é pequeno.
- Coluna gerada só lê a própria linha. O nome da categoria entra na consulta
  por junção, com peso C, concatenado ao vetor do prato. A consulta é sempre
  de um restaurante só (RLS), então o volume é pequeno.
- `websearch_to_tsquery` não aceita prefixo. O domínio normaliza o termo
  (`termosDeBusca`): tira acento, passa para minúsculas e mantém só `[a-z0-9]`
  (até 6 termos de até 40 caracteres). Com isso, a consulta monta
  `termo:* & outro:*` sem risco de injetar operador de `tsquery`.
- Ordem: relevância (`ts_rank`), depois a ordem da categoria e a do prato.
  Até 50 resultados. Prato removido e categoria removida nunca aparecem;
  esgotado aparece com `disponivel=false`.
- Conferido no Postgres 18 local: "abobora" acha "abóbora"; "cost:\*" e
  "chao:\*" acham "Costela" e "chão".

### Ordem: inteiros com espaçamento

- Itens novos entram no fim, com ordem igual à maior mais 1024.
- Mover um item grava só ele, no ponto médio entre os vizinhos
  (`planejarMovimento` no domínio). Quando o espaço entre dois vizinhos acaba,
  a lista daquela categoria (ou a lista de categorias) é renumerada de uma
  vez. O teste com 40 trocas seguidas no mesmo ponto renumera menos de 10
  vezes.
- Chave fracionária foi descartada: exige biblioteca, e o domínio não importa
  nada externo.
- O movimento trava a lista com `FOR UPDATE` e calcula o plano sobre o estado
  atual do banco, não sobre a lista que a tela tinha. A versão do item movido
  sobe; os vizinhos renumerados não sobem de versão, para não gerar conflito
  falso em quem edita outro prato.

### Trava otimista

`categorias.versao` e `pratos.versao` começam em 1. Toda escrita manda a
versão lida:

```sql
UPDATE ... SET ..., versao = versao + 1 WHERE id = $1 AND versao = $2 AND removido_em IS NULL
```

Se nenhuma linha muda, uma consulta separa os dois casos: conflito (o item
existe, em outra versão), que responde 409, e item inexistente, que responde 404.

### Remoção lógica, garantida pelo banco

`pratos.removido_em` e `categorias.removida_em`. O `app_runtime` não tem
`DELETE` nessas tabelas: um `DELETE` da aplicação é recusado pelo banco
(teste). O nome de categoria é único entre as ativas, sem distinguir acento
nem maiúsculas (índice único parcial com `lower(app.sem_acento(nome))`).

### Versão do cardápio e cache

- `restaurantes.versao_cardapio` sobe num gatilho por instrução (`AFTER ... FOR
EACH STATEMENT`) em `categorias`, `pratos`, `personalizacoes` e `horarios`,
  porque a resposta pública leva personalização e horários. Nenhum caminho de
  código precisa lembrar de invalidar.
- A chave do cache é `r:{restaurante_id}:cardapio:v{versao}`
  (`chavesRedis.cardapio`), com validade de 10 minutos. Publicar sobe a
  versão; a chave antiga expira sozinha.
- O cardápio é lido por uma consulta só (agregação JSON das quatro tabelas, no
  mesmo snapshot) e gravado no cache com a versão lida nesse snapshot, nunca
  com a versão resolvida antes. Assim, conteúdo velho nunca fica numa chave
  nova.
- Redis fora do ar: o cache lê como ausente e não grava (`status !== 'ready'`),
  e a leitura vai ao banco.
- Um gatilho por instrução sobe a versão mesmo quando o `UPDATE` não muda
  linha nenhuma (um conflito, por exemplo). O custo é só uma leitura a mais
  do banco.

### Rota pública por slug

- `GET /api/v1/cardapios/:slug` e `GET /api/v1/cardapios/:slug/busca?termo=`,
  só no host `DOMINIO_CARDAPIO` (ADR 0003), sem sessão.
- A função pré-inquilino `app.resolver_cardapio(slug)` (lista fechada,
  `SECURITY DEFINER`, dona `funcoes_privilegiadas`) devolve id, slug atual,
  versão e fuso.
  - Restaurante cancelado e slug desconhecido viram "inexistente" (404).
  - Slug do histórico vira 301 para o atual.
  - O `restaurante_id` nunca vem da requisição.
- Inadimplente continua servindo o cardápio (regra 8 do plano: o cardápio
  nunca sai do ar).
- Aberto ou fechado é calculado a cada requisição, no fuso do restaurante,
  sobre os horários que vêm no cardápio.
  - Horário que vira o dia cobre a madrugada seguinte.
  - Fechado traz `proximaAbertura`, e o cardápio continua visível.
- `Cache-Control: public, max-age=30, stale-while-revalidate=60`.
- Limite de taxa por IP, no Redis: 120 por minuto no cardápio e 60 por minuto
  na busca. Acima disso, 429.
- A resposta traz a personalização (a padrão, se o restaurante ainda não
  publicou nenhuma), como pede a seção 4 do plano.

### Preço e limites

- Preço em centavos inteiros do domínio ao banco (`CHECK` entre 0 e
  100.000.000). `Dinheiro` recusa negativo, fração e acima de
  R$ 1.000.000,00, e formata "R$ 1.234,56".
- O painel converte o texto "89,90" em centavos sem ponto flutuante
  (`centavosDoTexto`). O ponto só vale como separador de milhar, então
  "89.90" é recusado em vez de virar R$ 8.990,00.
- O Zod da API recusa preço não inteiro e campo a mais, como `restauranteId`
  no corpo.
- Limites, contados em grafemas: nome da categoria 40, nome do prato 80,
  descrição 400.
  - O domínio e o Zod contam igual, e um teste confere que os dois usam os
    mesmos números.
  - O banco tem `CHECK` mais folgado, em caracteres, como última barreira.

### Mídia

`pratos.midia_id` é anulável e ainda sem chave estrangeira; o M07 cria a
tabela de mídias e decide a direção da ligação.

### Painel

- Arrastar e soltar (HTML nativo), mais botões "Subir" e "Descer" em cada
  prato e categoria, para teclado e leitor de tela.
- Esgotado e destaque mudam na hora, de forma otimista, e voltam se a API
  recusar.
- No conflito de versão, a edição recarrega com os dados atuais e avisa.

## Consequências

- A versão do cardápio aparece na resposta pública (contador de mudanças). Não
  é dado sensível, e serve ao cliente do M09 para cache.
- O dicionário `portuguese` reduz as palavras ao radical: "massas" acha
  "massa". Termo de uma letra como prefixo casa muita coisa. Não há tolerância
  a erro de digitação ("cotela" não acha).
- A renumeração trava a lista do restaurante por um instante. Com centenas de
  pratos, continua uma operação curta.
- Resultado de busca não vai para o Redis; só para o `Cache-Control`. A busca
  usa índice e roda num restaurante só.

## Fontes consultadas

O proxy deste ambiente bloqueia postgresql.org e orm.drizzle.team. Li o
fonte oficial da documentação no repositório de cada projeto (o mesmo texto
das páginas) e conferi o comportamento no Postgres 18.6 local.

- https://www.postgresql.org/docs/18/unaccent.html (fonte:
  https://github.com/postgres/postgres/blob/REL_18_STABLE/doc/src/sgml/unaccent.sgml)
- https://www.postgresql.org/docs/18/textsearch-controls.html e
  https://www.postgresql.org/docs/18/textsearch-tables.html (fonte:
  https://github.com/postgres/postgres/blob/REL_18_STABLE/doc/src/sgml/textsearch.sgml):
  `websearch_to_tsquery` não aceita prefixo; `to_tsquery` aceita `:*`.
- https://www.postgresql.org/docs/18/ddl-generated-columns.html (fonte:
  https://github.com/postgres/postgres/blob/REL_18_STABLE/doc/src/sgml/ddl.sgml):
  a expressão só usa funções imutáveis e não lê outra linha.
- https://orm.drizzle.team/docs/generated-columns (fonte:
  https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/columns/common.ts,
  `generatedAlwaysAs`), e `customType` para o tipo `tsvector`.
