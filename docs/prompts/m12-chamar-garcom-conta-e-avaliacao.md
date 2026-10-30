# M12: Chamar garçom, conta e avaliação

## Contexto

M00 a M11 aceitos. O cliente abre a mesa, vê o cardápio e faz pedidos. O cookie de mesa carrega restaurante e sessão (ADR 0015). Falta chamar o garçom, pedir e ver a conta, e encerrar a visita com o convite para avaliar no Google.
Leia antes: CLAUDE.md; ADRs 0006, 0009, 0012, 0014 e 0015; no plano, a seção 1 (RF04, RF05, RF06, regras 4, 5 e 9) e a seção 3 (tabela `chamados`); e as telas `Chamado.dc.html` e `Conta.dc.html`.
Antes de tudo, confira no banco se `chamados` existe. Pelo histórico do M06 e do M11, é provável que não: se faltar, crie pelo ADR 0006 (PK composta, RLS forçado, fábricas, testes 1 a 8).

## Objetivo

O cliente chama o garçom ou pede a conta com um toque, sem criar chamado duplicado, e acompanha a situação. Vê o resumo da conta com taxa de serviço opcional e divisão por pessoas. Ao fim da visita, vê o agradecimento com o botão "Avaliar no Google". A equipe ainda não vê o chamado em tempo real (M13): aqui o chamado é gravado com evento na outbox e consultado.

## Escopo

Dentro:

- Domínio: `Chamado` (tipo garçom ou conta; máquina de estados: aguardando, em atendimento, concluído, cancelado), `ResumoDaConta` (subtotal dos pedidos da sessão, taxa de serviço opcional de 10%, divisão por pessoas).
- Casos de uso: `ChamarGarcom`, `PedirConta` (idempotentes por chave e pelo índice "um chamado aberto por tipo e sessão"), `CancelarChamado` (cliente, enquanto aguardando), `ObterResumoDaConta`.
- Evento `ChamadoCriado` na outbox, na mesma transação.
- API: rotas da sessão de mesa, com `Idempotency-Key` na criação.
- Cliente: tela "Do que você precisa?", acompanhamento do chamado, resumo da conta (taxa e divisão), e a tela final de agradecimento com o botão "Avaliar no Google" e o Instagram.
- "Avaliar no Google": usa o `link_avaliacao_google` da personalização (M04). Sem link cadastrado, o botão não aparece.
- Encerrar a visita: a equipe fecha a sessão (no M13); aqui, a tela de agradecimento aparece quando a sessão consta como fechada.
- ADR 0016.

Fora: a fila da equipe e o tempo real (M13); pagamento na mesa (V2).

## Decisões já tomadas

- Um chamado aberto por tipo e por sessão (índice único parcial). Um segundo toque devolve o chamado que já está aberto, sem criar outro e sem erro para o cliente.
- O resumo da conta soma os pedidos não cancelados da sessão, com os preços copiados no momento do pedido (M11). Calculado no servidor.
- Taxa de serviço: opcional, 10%, ligada por padrão, que o cliente pode desligar. É só um cálculo de exibição; a cobrança real é com o garçom. Arredondamento em centavos, documentado.
- Divisão por pessoas: só exibição, arredondada para cima por pessoa, com o total exato mostrado.
- "Avaliar no Google" aparece para todos os clientes, sem filtro de satisfação (regra 9 e a política do Google contra review gating).
- O botão abre o link em nova aba, com `rel="noopener"`.
- Orçamento de JS: a folga atual é grande (~115 KB de 170). Mesmo assim, as telas novas vão para o chunk sob demanda, como o carrinho.

## Testes obrigatórios

- Toque duplo em "Chamar garçom" cria um chamado só; o segundo devolve o aberto.
- Chamar garçom e pedir conta ao mesmo tempo: dois chamados (tipos diferentes) convivem.
- Cancelar: só enquanto aguardando; depois, recusa.
- Máquina de estados: transições só na ordem.
- Resumo: soma correta com taxa ligada e desligada; pedido cancelado não entra; divisão por 1, 2, 3 e 7 pessoas com o total exato.
- Avaliar no Google: aparece com link cadastrado; some sem link; abre em nova aba.
- Outbox: `ChamadoCriado` gravado na mesma transação.
- Isolamento: chamado de A nunca aparece para B; `chamados` passa nos testes 1 a 8.
- Sessão expirada recusa chamado com o caminho de escanear de novo.
- e2e no Chromium com axe: chamar, acompanhar, cancelar, pedir conta, ver o resumo, tela de agradecimento.
- Orçamento de JS e LCP ainda dentro do limite (Lighthouse, as três execuções no PR).

## Critério de pronto

`pnpm verificar` e CI verdes; demonstração no PR: chamar o garçom duas vezes (um chamado só), pedir a conta, o resumo com taxa e divisão, e a tela final; os números de JS e LCP. ADR 0016 escrito.

## Proibido

Chamado duplicado; total calculado no cliente; filtrar quem vê o botão de avaliação; `restaurante_id` do cliente; emoji.

## Entrega

Branch da sessão, atualizada a partir da main. Commits por assunto. PR `feat: chamar garçom, conta e avaliação (M12)`, com o que foi criado, demonstração, JS e LCP, riscos e sugestões.
