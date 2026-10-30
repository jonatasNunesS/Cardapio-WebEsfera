# M11: Pedido do cliente

## Contexto

M00 a M10 aceitos. O cliente já abre a sessão de mesa, vê o cardápio com vídeo e busca; há filas, outbox e o estado de inadimplência. Falta pedir.
Leia antes: CLAUDE.md; ADRs 0006, 0009, 0010, 0013 e 0014; no plano, as seções 1 (RF03, regras 2 a 5 e 8), 3 (tabelas `pedidos`, `itens_pedido`, `contadores_pedido`, `sessoes_mesa`) e 9 (idempotência, outbox); e as telas `Prato.dc.html`, `Carrinho.dc.html` e `SemConexao.dc.html`.

## Objetivo

O cliente monta o carrinho, envia o pedido e acompanha o status. O pedido é gravado na hora (não vai para fila), com idempotência e numeração por restaurante, e emite um evento na outbox. Rede ruim não cria pedido duplicado. Ainda sem o painel ver o pedido em tempo real (M13); aqui o status é consultado.

## Escopo

Dentro:

- Domínio: `Carrinho`, `Pedido` (máquina de estados: enviado, em preparo, pronto, entregue, cancelado), `ItemPedido` (nome e preço copiados no momento), validação por sessão de mesa.
- Casos de uso: `CriarPedido` (idempotente), `ObterPedido`, `CancelarPedido` (só em "enviado", pelo cliente).
- Numeração atômica por restaurante (`contadores_pedido`, já no M02).
- Gravação síncrona com evento `PedidoCriado` na outbox, na mesma transação.
- API: rotas da sessão de mesa (criar, obter, cancelar), com `Idempotency-Key` obrigatória na criação.
- Cliente: carrinho (folha inferior), observação por item, enviar, tela de status, e o estado de sem conexão com reenvio pela mesma chave.
- Regras: preço e total no servidor; prato esgotado ou removido não entra; restaurante suspenso por inadimplência recusa pedido (cardápio continua); restaurante fechado não aceita pedido.
- ADR 0015.

Fora: chamar garçom e conta (M12); o painel e o tempo real (M13); pagamento na mesa (V2).

## Antes de codar

Confira na documentação e cite no PR:

1. Orçamento do app `cardapio`: hoje a folga é de ~3 KB comprimidos. Meça o impacto do carrinho e do status ANTES de adicionar; se estourar os 170 KB, me avise com o número antes de seguir. Prefira reusar o que já existe no `ui` e carregar sob demanda o que der.
2. React Router: envio com estado otimista e reenvio seguro.
3. Geração da `Idempotency-Key` no cliente (uuid v7) e seu ciclo de vida (a mesma chave para o reenvio do mesmo carrinho).

## Decisões já tomadas

- O preço e o total são calculados no servidor a partir do cardápio atual; o cliente nunca envia valores. O item guarda nome e preço do momento, para um pedido antigo não mudar quando o cardápio mudar.
- Idempotência: a `Idempotency-Key` (uuid v7, gerada no cliente ao abrir o carrinho) é única por restaurante. Reenviar o mesmo carrinho devolve o mesmo pedido, não cria outro. Mudar o carrinho gera chave nova.
- Gravação síncrona: `CriarPedido` grava `pedidos`, `itens_pedido`, o número (contador atômico) e o evento na outbox, tudo numa transação curta, e responde ao cliente. Nada de fila no caminho do pedido.
- Disponibilidade no momento do envio: se um item ficou esgotado ou foi removido entre montar e enviar, o pedido é recusado com mensagem clara e o carrinho é mantido.
- Estado por sessão de mesa: o pedido pertence à sessão aberta da mesa; a sessão expirada recusa com o caminho de escanear de novo.
- Cancelar: só o cliente, só enquanto "enviado". Depois disso, só a equipe (no M13).
- Sem conexão: o carrinho fica no aparelho; o envio mostra "sem conexão" e o reenvio usa a mesma `Idempotency-Key`, sem duplicar.
- Inadimplência (regra 8) e fechado: recusam o pedido, mas o cardápio continua visível.

## Testes obrigatórios

- `CriarPedido`: duas requisições com a mesma `Idempotency-Key` geram um pedido só e a mesma resposta; chaves diferentes geram dois.
- Preço e total calculados no servidor; valor enviado pelo cliente é ignorado; item com preço copiado não muda ao mudar o cardápio.
- Numeração: pedidos simultâneos de 50 restaurantes, numeração por restaurante sem salto nem colisão (teste de carga, estilo M05).
- Esgotado/removido no envio: recusa com o carrinho mantido.
- Máquina de estados: transições válidas só na ordem; "entregue" não volta; cancelar só em "enviado".
- Outbox: o `PedidoCriado` é gravado na mesma transação; some o processo no meio e o evento não se perde (reusa a garantia do M05).
- Inadimplente e fechado recusam; o cardápio segue respondendo.
- Isolamento: pedido de A nunca aparece para B; as tabelas passam nos testes 1 a 8 do M02.
- Sem conexão: reenvio não duplica.
- Cliente e2e no Chromium com axe: montar, observação, enviar, status, cancelar, sem conexão.
- Orçamento de JS do cardápio ainda dentro de 170 KB; LCP ainda dentro de 2,5 s (reexecuta o Lighthouse, porque o app do cliente mudou).

## Critério de pronto

`pnpm verificar` e CI verdes; demonstração no PR: montar e enviar um pedido, o reenvio idempotente, a recusa por item esgotado, e o teste de carga da numeração; o novo tamanho de JS e o LCP. ADR 0015 escrito.

## Proibido

Preço ou total vindos do cliente; pedido pela fila; criar sem `Idempotency-Key`; mudar item de pedido já gravado; tirar o cardápio do ar por inadimplência; `restaurante_id` do cliente; emoji.

## Entrega

Branch da sessão, atualizada a partir da main. Commits por assunto. PR `feat: pedido do cliente (M11)`, com o que foi criado, URLs, demonstração, o JS e o LCP, riscos e sugestões.
