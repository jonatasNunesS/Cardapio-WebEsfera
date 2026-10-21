# Plano de desenvolvimento – Cardápio WebEsfera

Oct 20, 2026 · @John

## Resumo e decisões

O sistema será um monorepo em TypeScript com React no front, Node no back, PostgreSQL com isolamento por restaurante, Redis para cache e filas (BullMQ), Mercado Pago para as assinaturas e Sentry em todas as camadas. O desenvolvimento é feito pelo Claude Code em 18 módulos, cada um com um prompt próprio e um critério de pronto verificável.

### Decisões tomadas

| Tema | Decisão | Por quê |
| --- | --- | --- |
| Linguagem | TypeScript em modo estrito no front, no back e nos pacotes | Mesmo ecossistema de React e Node; os tipos pegam erros antes de rodar, e o Zod valida o que chega de fora |
| Front | React + Vite, CSS Modules e variáveis CSS, sem Tailwind | Cor do restaurante vira uma variável; nenhum utilitário de CSS no HTML |
| Back | Node 24 LTS com Fastify, monólito modular em camadas | Uma peça para operar; módulos prontos para virar serviço |
| Dados | PostgreSQL com RLS por restaurante, Drizzle e migrações SQL | Isolamento garantido pelo banco |
| Cache, filas e tempo real | Redis: cache, BullMQ, limite de taxa e pub/sub do SSE | Uma peça resolve quatro problemas |
| Pagamento da plataforma | Mercado Pago Assinaturas, confirmado por webhook assinado | É o braço de pagamentos do Mercado Livre |
| Erros | Sentry v11 com erros tipados, contexto e source maps | Cada erro diz módulo, caso de uso, restaurante e linha |
| Identificadores | Português do Brasil, salvo convenção obrigatória | Regra de código já definida para os seus projetos |

### Onde discordo do briefing

- **TypeScript é a primeira rede contra bug, não um detalhe.** Num SaaS com dinheiro, várias empresas no mesmo banco e uma IA escrevendo o código, os tipos pegam na hora o que só apareceria em produção. Eles não validam o que vem de fora, então o Zod continua em toda fronteira: HTTP, fila, webhook e variáveis de ambiente.
- **Fila não é para tudo.** O pedido do cliente é gravado na hora, porque ele precisa da confirmação. O que vai para a fila é o que pode atrasar uns segundos: avisos, vídeo, webhooks, e-mails e relatórios (seção 9).
- **`try/catch` e `else` não são testes.** São tratamento de erro. Os testes são automáticos (Vitest, Testcontainers e Playwright), e o `try/catch` fica concentrado em poucos pontos, para nenhum erro ser engolido em silêncio (seção 8).
- **Escrever os 18 prompts de uma vez deixaria os últimos velhos.** Cada prompt é escrito quando o módulo anterior for aceito, a partir do código real. A seção 11 traz a lista, o modelo e o prompt completo do primeiro módulo.

### Como usar com o Claude Code

1. Crie o repositório e cole o arquivo `CLAUDE.md` da seção 11 na raiz. Ele carrega as regras fixas: sem emoji, CSS com variáveis, camadas, nomes em português e testes obrigatórios.
2. Rode um módulo por vez, em uma branch própria, colando o prompt do módulo.
3. Só passe ao próximo quando o critério de pronto passar no CI e você revisar o pull request.

## 1. Produto: objetivos, escopo e regras

O produto é um cardápio por QR Code para vários restaurantes, com vídeo do prato, pedido, chamada do garçom e conta pelo celular, sem app e sem cadastro do cliente. A WebEsfera cobra uma assinatura mensal de cada restaurante pelo Mercado Pago.

### Público e problemas

| Quem | Problema | O que o sistema faz |
| --- | --- | --- |
| Cliente na mesa | Decide sem ver o prato e espera o garçom para tudo | Vídeo do prato; pedido, chamada e conta no celular |
| Garçom e cozinha | Não sabem qual mesa chamou nem em que ordem | Fila ao vivo no celular e na TV, com quem assumiu |
| Dono do restaurante | Cardápio impresso é caro e não mostra o prato | Painel que muda preço, foto e vídeo na hora |
| Equipe WebEsfera | Gerir clientes, cobranças e suporte | Admin da plataforma com auditoria |

### Requisitos funcionais por fase

| Código | Requisito | Fase |
| --- | --- | --- |
| RF01 | Abrir o cardápio pelo QR Code, com tela de abertura, QR inválido e sessão expirada | MVP |
| RF02 | Categorias, busca sem acento e prato com vídeo em loop, mudo e com pausa | MVP |
| RF03 | Carrinho, observação por item, pedido idempotente e status ao vivo | MVP |
| RF04 | Chamar garçom e pedir conta, sem chamado duplicado | MVP |
| RF05 | Resumo da conta com taxa de serviço opcional e divisão por pessoas | MVP |
| RF06 | Botão "Avaliar no Google" no fim da conta, para todos os clientes | MVP |
| RF07 | Restaurante fechado: cardápio visível, pedido desligado | MVP |
| RF08 | Painel: cardápio e vídeos; mesas cadastradas como lista, cada uma com link próprio e QR Code exportável em PNG | MVP |
| RF09 | Painel: fila ao vivo no celular e modo TV | MVP |
| RF10 | Personalização: cor da marca com checagem de contraste, logo, capa, nome, frase, link do Google, textos, horário | MVP |
| RF11 | Cadastro, teste de 10 dias e assinatura pelo Mercado Pago | MVP |
| RF12 | Admin: visão geral, restaurantes, detalhe, cobranças, acesso de suporte auditado, mesas e links de cada restaurante | MVP |
| RF13 | Perfis da equipe (dono, gerente, garçom, cozinha) com PIN por aparelho | V1.1 |
| RF14 | Relatórios: pratos mais vistos e pedidos, tempo de atendimento | V1.1 |
| RF15 | Idiomas e filtros de alérgenos | V1.1 |
| RF16 | Pix na mesa para o cliente final | V2 |
| RF17 | Impressora da cozinha e integração com PDV | V2 |

### Requisitos não funcionais

| Tema | Meta |
| --- | --- |
| Isolamento | Nenhum dado de um restaurante aparece para outro, garantido por RLS e por teste no CI |
| Velocidade | Cardápio com LCP até 2,5 s no 4G (p75); API de leitura até 300 ms e de escrita até 500 ms (p95) |
| Tempo real | Pedido ou chamado no painel em até 2 s (p95) |
| Carga | 100 req/s de API e 3.000 conexões de tempo real, com todos os restaurantes no jantar ao mesmo tempo |
| Disponibilidade | 99,9% ao mês no cardápio e no pedido |
| Acessibilidade | WCAG 2.2 nível AA |
| Código | Sem emoji em código, interface e documentação; CSS com variáveis; nada de Tailwind |
| Erros | Todo erro inesperado chega ao Sentry com módulo, caso de uso, restaurante, release e linha |

### Regras de negócio

1. Cada restaurante é um inquilino isolado; o `restaurante_id` vem sempre da sessão, nunca da URL ou do corpo da requisição.
2. O servidor calcula preço e total. O celular nunca envia valores.
3. Pedido e chamado usam chave de idempotência; um reenvio por rede ruim não cria duplicata.
4. Um chamado do mesmo tipo por sessão de mesa fica aberto por vez.
5. Pedidos e chamados só avançam pelas transições permitidas da máquina de estados.
6. O único elemento visual editável pelo restaurante é a cor da marca, com logo e identidade. A cor só é publicada se passar no contraste: 4,5:1 no texto do botão e 3:1 contra o fundo.
7. Assinatura: teste de 10 dias sem cartão. Depois, a assinatura só vira "ativa" quando o webhook do Mercado Pago for validado e o pagamento for confirmado na API.
8. Inadimplência (proposta a validar): aviso no dia 1 e pedidos pela mesa suspensos no dia 15. O cardápio nunca sai do ar.
9. O botão de avaliação do Google aparece para todos; é proibido filtrar só os clientes satisfeitos.
10. Do cliente final, guardamos só mesa, itens, observações e horário.

### Link e QR Code de cada mesa

Cada mesa tem um link que carrega o restaurante, a mesa e um código, e o QR Code impresso na mesa é gerado a partir desse link. Assim o QR nunca abre outro restaurante, e trocar o número na barra do navegador não dá acesso a outra mesa.

```
https://[seu-dominio]/{slug-do-restaurante}/mesa/{numero}?c={codigo}
https://[seu-dominio]/brasa-e-trigo/mesa/12?c=8fK2pQx7Lm4Rt9Wb2Zq1Ay
```

| Parte | O que é | Regra |
| --- | --- | --- |
| Slug | O restaurante | Único na plataforma; não muda sozinho quando o nome muda |
| Número | A mesa | Único dentro do restaurante; Mesa 12 pode existir em vários restaurantes |
| Código `c` | A prova de que o QR é daquela mesa | 22 caracteres aleatórios (128 bits); é ele que o servidor usa para resolver |

1. O dono cadastra as mesas no painel como uma lista, igual às categorias: número, nome opcional e área (Salão, Varanda). Cada mesa ganha o link na hora, com botão de copiar.
2. O QR Code é gerado automaticamente a partir do link e exportado em PNG, de uma mesa ou de todas (arquivo ZIP). O PNG sai como um cartão pronto para imprimir: logo, número da mesa e o QR. O logo fica fora do QR, para não atrapalhar a leitura.
3. O servidor resolve pelo código e confere se o slug e o número combinam. Se não combinarem, ou se a mesa estiver desativada, abre a tela de QR inválido e o caso vai para o log de segurança.
4. Renumerar uma mesa não invalida o QR impresso: o código continua valendo, e o link antigo redireciona para o endereço novo.
5. "Gerar novo código" invalida o QR antigo na hora (o cache da mesa é apagado) e fica na auditoria. Serve para QR fotografado e usado de fora do restaurante.
6. O slug só pode ser trocado pela equipe WebEsfera no admin, e o slug antigo continua redirecionando. Assim nenhum QR já impresso quebra.
7. No admin, o detalhe de cada restaurante mostra todas as mesas com o link, a situação e a data do código, para suporte. Só leitura e cópia.
8. O link da mesa não dá nenhum acesso ao painel; ele só abre uma sessão de mesa de 4 horas.

### Critérios de sucesso do MVP

- 3 a 5 restaurantes piloto por 4 semanas, com ao menos 80% publicando cardápio com vídeo em até 30 minutos.
- Menos de 1% dos pedidos com erro do sistema e zero acessos entre restaurantes.
- Ao menos um restaurante pagando pelo Mercado Pago ao fim do teste.

### Riscos principais

| Risco | Impacto | Resposta |
| --- | --- | --- |
| Restaurantes não conseguem gravar bons vídeos | Alto | Foto como padrão, guia de gravação e gravação como serviço da WebEsfera |
| Escopo grande para uma pessoa com IA | Alto | Módulos pequenos com critério de pronto; corte da V1.1 |
| Webhook do Mercado Pago perdido ou falso | Alto | Validação de assinatura, consulta à API e conciliação diária |
| Pico de pedidos no jantar de sábado | Médio | Limites por mesa e restaurante, filas para o que é assíncrono, teste de carga |
| Código gerado por IA com padrões inconsistentes | Médio | `CLAUDE.md`, lint de fronteiras entre camadas e revisão de cada pull request |

**Expansão:** redes com várias unidades, Pix na mesa, integração com PDV e iFood, e a gravação dos vídeos como serviço da WebEsfera.

## 2. Arquitetura e engenharia de software

A arquitetura é um monólito modular em camadas (Clean Architecture): três aplicações React, uma API Node, um worker de filas e pacotes compartilhados, tudo num monorepo. A regra central: as dependências apontam para dentro, e o domínio não conhece banco, HTTP, Redis nem Mercado Pago.

&#91;embedded content: arquitetura · 3 apps, API, worker e 3 serviços\]

Os apps nunca falam com o banco ou o Redis direto. O Mercado Pago só chega pelo webhook da API, e quem consulta a API dele e muda a assinatura é o worker.

### Aplicações e pacotes

| Peça | Papel | Por que separada |
| --- | --- | --- |
| `apps/cardapio` | Cardápio do cliente na mesa (React) | Precisa ser a mais leve: JavaScript mínimo para abrir rápido no 4G |
| `apps/painel` | Painel do restaurante: fila, cardápio, mesas, personalização | Usa componentes mais pesados, que o cliente não precisa baixar |
| `apps/admin` | Administração da plataforma WebEsfera | Domínio e login separados: o alvo mais valioso não divide sessão com o resto |
| `apps/api` | API HTTP e canal de tempo real (SSE) | Sem estado: escala colocando mais instâncias |
| `apps/worker` | Consumidores das filas BullMQ: vídeo, notificações, webhooks, e-mails, rotinas | Trabalho pesado ou lento não ocupa a API |
| `pacotes/dominio` | Entidades, objetos de valor, regras e máquinas de estado | Puro: zero dependência externa, 100% testável |
| `pacotes/aplicacao` | Casos de uso e portas (interfaces) | Orquestra o domínio; não sabe quem implementa as portas |
| `pacotes/infraestrutura` | Adaptadores: PostgreSQL, Redis, BullMQ, Mercado Pago, armazenamento, e-mail | Trocar um provedor é trocar um adaptador |
| `pacotes/contratos` | Esquemas Zod de entrada e saída da API e dos jobs | Um esquema só valida no servidor e tipa o front |
| `pacotes/ui` | Design system: tokens CSS, componentes React acessíveis | O mesmo botão nas três aplicações |
| `pacotes/observabilidade` | Erros tipados, logger e integração com o Sentry | Toda camada reporta erro do mesmo jeito |
| `pacotes/config` | TypeScript, ESLint, Prettier e variáveis de ambiente validadas | Uma configuração para o monorepo inteiro |

### Camadas e o que cada uma pode importar

| Camada | Responsabilidade | Pode importar |
| --- | --- | --- |
| Interface (rotas HTTP, handlers de fila, páginas React) | Traduz entrada em chamada de caso de uso e o resultado em resposta | Aplicação, contratos |
| Aplicação | Um caso de uso por ação: `CriarPedido`, `ChamarGarcom`, `ConfirmarPagamentoAssinatura` | Domínio |
| Domínio | Regras puras: `Pedido`, `Chamado`, `Dinheiro`, `CorDaMarca`, `Assinatura` | Nada |
| Infraestrutura | Implementa as portas: `RepositorioPedidos`, `FilaDeJobs`, `GatewayPagamento`, `PublicadorTempoReal` | Aplicação, domínio |

Uma regra de lint (`eslint-plugin-boundaries`) quebra o build se uma camada importar o que não pode, ou se surgir dependência circular (`madge` no CI).

### Módulos de negócio (dentro de aplicação e infraestrutura)

| Módulo | Responsabilidade | Depende de |
| --- | --- | --- |
| `restaurantes` | Inquilino, situação, horário, personalização | Nenhum |
| `identidade` | Contas, sessões, papéis, dois fatores do admin | `restaurantes` |
| `assinaturas` | Planos, teste, Mercado Pago, inadimplência | `restaurantes` |
| `cardapio` | Categorias, pratos, mídia, busca | `restaurantes` |
| `midia` | Envio, transcodificação e entrega de vídeo e imagem | `cardapio` |
| `mesas` | Mesas, tokens de QR, sessões de mesa | `restaurantes` |
| `pedidos` | Carrinho, pedido e máquina de estados | `cardapio`, `mesas` |
| `atendimento` | Chamados (garçom e conta) e resumo da conta | `mesas`, `pedidos` |
| `tempo-real` | Eventos para o painel, a TV e o cliente | `pedidos`, `atendimento` |
| `administracao` | Visão geral, suporte auditado, cobranças | Todos, só por casos de uso |
| `auditoria` | Registro de quem fez o quê | Nenhum |

Módulos conversam por casos de uso e por eventos de domínio (`PedidoCriado`, `PagamentoConfirmado`), nunca lendo a tabela do outro.

### Estrutura de pastas

```
cardapio-webesfera/
  apps/
    cardapio/            React: QR, cardápio, prato, carrinho, chamado, conta
    painel/              React: fila, cardápio, mesas, personalização
    admin/               React: plataforma WebEsfera
    api/                 Fastify: rotas, SSE, webhooks
      src/modulos/<modulo>/rotas.ts
    worker/              BullMQ: um processador por fila
      src/filas/<fila>/processador.ts
  pacotes/
    dominio/src/<modulo>/        entidades, regras, eventos
    aplicacao/src/<modulo>/      casos-de-uso/, portas/
    infraestrutura/src/          banco/, redis/, filas/, pagamentos/, armazenamento/
    contratos/src/<modulo>/      esquemas Zod
    ui/src/                      tokens.css, componentes/
    observabilidade/src/         erros/, logger.ts, sentry.ts
    config/                      tsconfig, eslint, prettier, ambiente.ts
  banco/migracoes/               SQL versionado
  docs/                          adr/, runbooks/, prompts/
  CLAUDE.md                      regras fixas para o Claude Code
```

### Convenções

- Identificadores, pastas, tabelas e colunas em português do Brasil, sem acento no código (`restaurante_id`, `criarPedido`). Exceção: nomes que o framework exige (`useEffect`, `onClick`, `index.ts`).
- Um arquivo por caso de uso, um componente por arquivo, funções de até cerca de 40 linhas.
- Sem comentário no código, salvo uma decisão não óbvia, com o link do ADR.
- Sem emoji em código, commits, interface e documentação; ícones só como SVG do pacote `ui`.
- Commits convencionais (`feat:`, `fix:`, `chore:`), pull request pequeno e com teste.

### Padrões aplicados

| Princípio ou padrão | Onde entra |
| --- | --- |
| Responsabilidade única | `CriarPedido` grava e emite `PedidoCriado`; quem avisa a cozinha é o consumidor da fila |
| Aberto e fechado | Outro provedor de pagamento ou de vídeo é um novo adaptador da mesma porta |
| Substituição de Liskov | Cada adaptador passa nos mesmos testes de contrato da sua porta |
| Segregação de interfaces | Portas pequenas: `GatewayPagamento`, `FilaDeJobs`, `PublicadorTempoReal`, `Relogio` |
| Inversão de dependência | O domínio define a porta; a infraestrutura implementa; a injeção acontece na composição de cada app |
| Resultado explícito | Casos de uso devolvem `Resultado<Sucesso, ErroDeNegocio>`; exceção fica para o inesperado |
| Máquina de estados | Pedido, chamado e assinatura só mudam por transições permitidas |
| Outbox transacional | O evento é gravado na mesma transação do dado e publicado depois, sem perder nada |
| Idempotência | Chave em pedido, chamado e webhook; repetir não duplica |

### Escalabilidade e reutilização

- API e worker sem estado: escalar é subir mais instâncias.
- Cardápio publicado sai do CDN e do cache do Redis; o banco quase não é tocado na leitura.
- O tempo real passa por Redis pub/sub, então qualquer instância da API entrega o evento a qualquer painel conectado.
- Os pacotes `ui` e `contratos` servem às três aplicações e, no futuro, a um app nativo.

## 3. Modelagem e arquitetura de dados

Um PostgreSQL compartilhado guarda todos os restaurantes, com `restaurante_id` em toda tabela de restaurante, chaves compostas e RLS forçado. Os arquivos de isolamento entregues antes nesta conversa (`001_tenancy_rls.sql` e os demais) são a base, e o módulo M02 os traduz para os nomes em português abaixo.

### Entidades

| Tabela | Campos principais | Restrições e índices |
| --- | --- | --- |
| `planos` | codigo, nome, preco\_centavos, limite\_mesas, recursos (jsonb), mp\_plano\_id, ativo | `codigo` único |
| `restaurantes` | slug, nome, situacao (teste, ativo, carencia, inadimplente, cancelado), fuso\_horario, teste\_termina\_em | `slug` único; índice por `situacao` |
| `personalizacoes` | restaurante\_id, cor\_marca, logo\_url, capa\_url, frase, link\_avaliacao\_google, textos (jsonb), versao | Uma por restaurante; `cor_marca` com CHECK de formato hex |
| `horarios` | restaurante\_id, dia\_semana, abre, fecha | Único por restaurante e dia |
| `usuarios` | nome, email, hash\_senha, segredo\_2fa | `email` único |
| `vinculos` | usuario\_id, restaurante\_id, papel (dono, gerente, garcom, cozinha), hash\_pin | Único por usuário e restaurante |
| `administradores` | usuario\_id, papel (suporte, financeiro, dono\_plataforma) | Sem `restaurante_id`; acesso só pelo app admin |
| `assinaturas` | restaurante\_id, plano\_id, situacao, mp\_preapproval\_id, proxima\_cobranca\_em, carencia\_ate | Uma vigente por restaurante (índice único parcial) |
| `cobrancas` | restaurante\_id, assinatura\_id, referencia (mês), valor\_centavos, situacao (a\_vencer, paga, vencida, estornada), forma, mp\_pagamento\_id, paga\_em | Única por assinatura e referência; `mp_pagamento_id` único |
| `eventos_pagamento` | provedor, topico, recurso\_id, x\_request\_id, corpo (jsonb), processado\_em, erro | Único por (provedor, x\_request\_id): registro de auditoria; a idempotência real vem de o worker reconsultar o recurso e só aplicar a transição se a situação mudou, porque uma nova tentativa do Mercado Pago pode chegar com outro x-request-id |
| `categorias` | restaurante\_id, nome, ordem, ativa | Única por restaurante e nome |
| `pratos` | restaurante\_id, categoria\_id, nome, descricao, preco\_centavos, disponivel, destaque, ordem, versao, busca (tsvector) | Índice GIN em `busca` com `unaccent`; `versao` para trava otimista |
| `midias` | restaurante\_id, prato\_id, tipo (foto, video), situacao (enviando, processando, pronta, falhou), caminho\_original, caminho\_mp4, caminho\_capa, duracao\_ms, tamanho\_bytes | Índice por `situacao` para a fila |
| `mesas` | restaurante\_id, numero, nome, area, token\_qr, ativa, token\_gerado\_em | `token_qr` único (128 bits); número único por restaurante; desativar não apaga, para manter o histórico de pedidos |
| `sessoes_mesa` | restaurante\_id, mesa\_id, aberta\_em, fechada\_em, expira\_em | Índice único parcial: uma sessão aberta por mesa |
| `contadores_pedido` | restaurante\_id, ultimo\_numero | Numeração por restaurante, atômica |
| `pedidos` | restaurante\_id, sessao\_id, numero, situacao, total\_centavos, chave\_idempotencia, criado\_em | Únicos: (restaurante\_id, chave\_idempotencia) e (restaurante\_id, numero) |
| `itens_pedido` | restaurante\_id, pedido\_id, prato\_id, nome\_no\_momento, preco\_no\_momento\_centavos, quantidade, observacao | Preço e nome copiados: mudar o cardápio não altera pedido antigo |
| `chamados` | restaurante\_id, sessao\_id, tipo (garcom, conta), situacao, assumido\_por, criado\_em | Índice único parcial: um chamado aberto por tipo e sessão |
| `caixa_saida` (outbox) | restaurante\_id, tipo\_evento, carga (jsonb), criado\_em, publicado\_em, tentativas | Índice parcial em `publicado_em IS NULL` |
| `auditoria` | restaurante\_id (pode ser nulo), autor\_tipo, autor\_id, acao, entidade, entidade\_id, antes, depois, motivo, criado\_em | Só inserção; particionada por mês |

### O que o banco garante sozinho

- **Isolamento:** RLS com `ENABLE` e `FORCE` e políticas `USING` e `WITH CHECK` em toda tabela com `restaurante_id`. O papel da aplicação não tem `BYPASSRLS`. O restaurante entra por `set_config('app.restaurante_id', ..., true)`, que vale só dentro da transação.
- **Chaves compostas:** toda FK entre tabelas de restaurante usa (restaurante\_id, id). Um pedido não aponta para a mesa de outro restaurante.
- **Sem duplicidade:** idempotência em pedido e webhook, sessão e chamado abertos únicos, numeração atômica.
- **Tipos:** dinheiro em centavos inteiros, datas em `timestamptz` (UTC), ids UUID v7 (ordenáveis no tempo).
- **Única porta pré-inquilino:** a função `app.resolver_token_qr`, que devolve só os ids a partir do token.

### Migrações e integridade

- SQL versionado em `banco/migracoes`, aplicado pelo CI: primeiro em homologação, depois em produção.
- Migração aplicada nunca é editada. Mudança sem parada segue expandir e contrair: adiciona a coluna, migra código e dados, e só numa versão seguinte remove a antiga.
- Índice novo sempre com `CREATE INDEX CONCURRENTLY` e `lock_timeout`.
- Job semanal procura órfãos, sessões abertas há mais de 12 horas e cobranças sem evento correspondente.

### Cache no Redis

| Chave | Conteúdo | Validade | Invalidação |
| --- | --- | --- | --- |
| `r:{id}:cardapio:v{versao}` | Cardápio publicado, já montado | 10 min | Nova versão ao publicar; a chave antiga expira sozinha |
| `r:{id}:personalizacao` | Cor, logo, textos, link do Google | 10 min | Apagada ao publicar a personalização |
| `qr:{token}` | restaurante\_id e mesa\_id | 5 min | Apagada ao desativar a mesa |
| `r:{id}:assinatura` | Situação da assinatura | 60 s | Apagada no webhook processado |
| `limite:{escopo}:{chave}` | Contadores de limite de taxa | Janela do limite | Automática |

Toda chave de restaurante nasce de uma função única (`chavesRedis`), sempre com o id do restaurante. Pedido, chamado e fila do painel nunca vão para cache compartilhado.

### Consultas

- O cardápio é uma consulta só, com categorias, pratos e mídias prontas, servida do cache.
- A fila do painel lê por índice parcial (situação aberta) e depois se atualiza por eventos, sem consulta repetida.
- Listas paginadas por cursor (`criado_em`, `id`) e itens carregados em lote, sem consulta N+1.
- Relatórios (V1.1) em tabelas agregadas por dia.

### Backup, restauração e retenção

| Item | Política |
| --- | --- |
| Backup | Diário, criptografado e em outra conta; recuperação para um ponto no tempo quando houver receita |
| Teste de restauração | Mensal, em ambiente separado, com o tempo registrado (meta: RTO de 4 h) |
| Pedidos e chamados | 24 meses detalhados; depois, só agregados sem dado pessoal |
| Eventos de pagamento | 5 anos, para conciliação e fiscal (confirmar com o contador) |
| Auditoria | 12 meses; incidentes de segurança, 5 anos |
| Fim da conta | 30 dias para exportar; depois, exclusão, e os backups expiram em até mais 30 dias |
| Mídia | Versionamento do bucket; originais em área privada |

## 4. UX/UI e design system

O design segue o protótipo aprovado no Claude Design (17 telas) e vira um design system em CSS puro: tokens em variáveis CSS, componentes React com CSS Modules e um único ponto onde entra a cor de cada restaurante. Nada de Tailwind, nenhum estilo inline fora do que é dinâmico.

### Como a cor do restaurante entra

1. A API devolve a personalização junto com o cardápio: `cor_marca` e as duas cores derivadas, calculadas e validadas no servidor (`cor_texto_sobre_marca` e `cor_marca_texto`).
2. O app define três variáveis no elemento raiz, e só elas: `--cor-marca`, `--cor-sobre-marca`, `--cor-marca-texto`.
3. Todo componente usa só tokens. Trocar de restaurante é trocar três variáveis; nenhum componente conhece a cor.
4. O contraste é checado em dois lugares: na tela de Personalização, para guiar o dono, e no caso de uso `PublicarPersonalizacao`, que recusa a cor que não passa. A checagem do front não é confiável sozinha.

### Tokens (arquivo `pacotes/ui/src/tokens.css`)

```css
:root {
  --cor-fundo: #F7F4F0;
  --cor-superficie: #FFFFFF;
  --cor-texto: #1F1A17;
  --cor-texto-secundario: #5C524B;
  --cor-borda: #E3DBD2;
  --cor-borda-campo: #8C8079;
  --cor-foco: #1849A9;
  --cor-sucesso: #067647;
  --cor-sucesso-fundo: #E2F1E7;
  --cor-aviso: #B54708;
  --cor-aviso-fundo: #FEF0C7;
  --cor-perigo: #B42318;
  --cor-perigo-fundo: #FDECEA;

  --cor-marca: #B4441F;
  --cor-sobre-marca: #FFFFFF;
  --cor-marca-texto: #B4441F;

  --fonte-titulo: 'Bricolage Grotesque', system-ui, sans-serif;
  --fonte-texto: 'DM Sans', system-ui, sans-serif;
  --tamanho-1: 0.75rem; --tamanho-2: 0.875rem; --tamanho-3: 1rem;
  --tamanho-4: 1.25rem; --tamanho-5: 1.5rem; --tamanho-6: 2rem;

  --espaco-1: 4px; --espaco-2: 8px; --espaco-3: 12px; --espaco-4: 16px;
  --espaco-5: 24px; --espaco-6: 32px; --espaco-7: 48px;
  --raio-1: 8px; --raio-2: 12px; --raio-3: 14px; --raio-total: 999px;
  --alvo-toque: 44px;
  --duracao: 200ms;
}

[data-tema='painel'] {
  --cor-fundo: #F4F6F8;
  --cor-texto: #303642;
  --cor-texto-secundario: #5B6472;
  --cor-marca: #00C2CB;
  --cor-sobre-marca: #303642;
  --fonte-titulo: 'Poppins', system-ui, sans-serif;
  --fonte-texto: 'Open Sans', system-ui, sans-serif;
}

@media (prefers-reduced-motion: reduce) {
  :root { --duracao: 0ms; }
}
```

O cardápio usa a cor do restaurante. O painel e o admin usam a marca WebEsfera (ciano `#00C2CB` com texto `#303642`, 5,5:1). O ciano com texto branco dá 2,19:1 e é proibido.

### Componentes do pacote `ui`

| Componente | Estados | Usado em |
| --- | --- | --- |
| `Botao` (principal, secundário, perigo, texto) | normal, foco, carregando, desativado | Todos |
| `CampoTexto`, `AreaTexto`, `Seletor`, `Caixa`, `Radio` | normal, foco, erro, desativado | Painel, admin, busca |
| `VideoPrato` | capa, carregando, tocando, pausado, falhou, movimento reduzido | Cardápio |
| `CartaoPrato` | normal, destaque, esgotado | Cardápio, busca, fechado |
| `ChipCategoria`, `FiltroChip` | normal, selecionado | Cardápio, admin |
| `SeletorQuantidade` | mínimo, máximo, desativado | Prato, carrinho |
| `FolhaInferior` | aberta, fechada (prende o foco) | Carrinho |
| `SeloSituacao` | aguardando, em atendimento, concluído, cancelado, vencida, paga | Todos |
| `ItemFila` | novo, assumido, atrasado | Fila, TV |
| `Aviso` e `Toast` | informação, sucesso, aviso, erro | Todos |
| `Tabela` com rolagem lateral | vazia, carregando, com dados | Admin |
| `Icone` (SVG inline, traço) | tamanhos 16, 20, 24 | Todos; nunca emoji |

Cada componente tem uma página no Storybook com todos os estados e teste visual automático.

### Estados de tela (já desenhados no protótipo)

| Situação | Cliente | Painel e admin |
| --- | --- | --- |
| Carregando | Capa e esqueleto; vídeo depois | Esqueleto da lista |
| Vazio | "Nada encontrado" com saída | "Nenhum chamado agora" |
| Erro | Mensagem, "Tentar de novo", carrinho guardado | Aviso e reconexão automática |
| Sem conexão | Pedido não enviado, reenvio sem duplicar | Faixa "Atualização lenta" |
| Fechado | Cardápio visível, pedido desligado | Não se aplica |
| QR inválido ou sessão expirada | Tela neutra, sem a marca | Não se aplica |
| Inadimplente | Cardápio no ar; pedidos pausados após o dia 15 | Faixa de cobrança vencida |

### Responsividade

O cardápio parte de 360 px. O painel funciona no celular do garçom e no desktop. A TV é pensada para 1080p, com texto de 24 px no mínimo. Layouts com flex e grid, unidades `rem`, `clamp()` nos títulos e consultas de contêiner (`@container`) nos cartões.

## 5. Segurança, privacidade e conformidade

Os três riscos mais caros são, nesta ordem: um restaurante ver dado de outro, um webhook falso liberar uma assinatura sem pagamento e alguém tomar a conta de admin. O desenho ataca os três desde o primeiro módulo.

### Autenticação

| Quem | Como entra | Proteções |
| --- | --- | --- |
| Cliente na mesa | Sem conta: token do QR (128 bits) gera um cookie de sessão de mesa assinado, de 4 h | Limite de pedidos por mesa e por IP; a equipe pode recusar o pedido |
| Dono e gerente | E-mail e senha (Argon2id), cookie `HttpOnly`, `Secure`, `SameSite=Lax` | Bloqueio progressivo, sessões revogáveis, CSRF nas rotas de escrita |
| Garçom e cozinha (V1.1) | PIN de 4 a 6 dígitos, válido só em aparelho aprovado pelo dono | Limite de tentativas; troca fácil; auditoria |
| Admin WebEsfera | E-mail, senha e segundo fator obrigatório (TOTP) | App e domínio separados, sessão curta, alerta a cada login |

### Autorização

- Cada caso de uso confere papel e restaurante no servidor; a interface só esconde o que o papel não pode.
- O `restaurante_id` vem da sessão autenticada, nunca da URL, do corpo ou da query.
- O acesso de suporte exige motivo, dura 30 minutos, avisa o dono e grava cada ação na auditoria.
- Dados como CNPJ, telefone e e-mail aparecem mascarados no admin; revelar fica registrado.

### Webhook do Mercado Pago

1. Ler `x-signature` (formato `ts=...,v1=...`) e `x-request-id`, e o `data.id` da query.
2. Montar o manifesto `id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;` e calcular HMAC-SHA256 com o segredo do webhook. Comparar com `v1` em tempo constante (`crypto.timingSafeEqual`).
3. Assinatura inválida: responder 401 e registrar no Sentry como alerta de segurança.
4. Assinatura válida: gravar o evento em `eventos_pagamento`, colocar na fila `pagamentos` e responder 200 na hora. O Mercado Pago espera no máximo 22 s. Se o Redis estiver fora, responde 200 mesmo assim: o evento já está gravado, e a rotina de conciliação reprocessa os eventos sem `processado_em`.
5. O worker consulta o recurso na API do Mercado Pago (o webhook traz só o id) e só então muda a assinatura. O corpo do webhook nunca é confiado como verdade.

### Entradas, segredos e dependências

- Toda entrada (HTTP, fila, webhook, variável de ambiente) passa por um esquema Zod. A aplicação não sobe com variável faltando.
- Consultas parametrizadas; descrições de prato em texto simples, escapadas na saída; nada de `dangerouslySetInnerHTML`.
- Upload por URL assinada de curta duração, com validação de tipo e tamanho; o FFmpeg roda em contêiner isolado, sem rede, com limite de CPU, memória e tempo.
- Segredos em cofre do provedor, um conjunto por ambiente. Varredura de segredos (gitleaks) em cada commit.
- Dependências com lockfile, atualização automatizada e auditoria no CI; ações do CI fixadas por hash.
- Cabeçalhos: CSP com nonce, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CORS restrito aos três domínios.

### OWASP Top 10:2025 aplicado

| Categoria | Controle principal |
| --- | --- |
| A01 Controle de acesso | RLS, chaves compostas, papel em cada caso de uso, teste de acesso cruzado |
| A02 Configuração insegura | CSP, buckets privados, ambientes separados, variáveis validadas |
| A03 Cadeia de suprimentos | Lockfile, auditoria, ações fixadas, SBOM |
| A04 Criptografia | TLS, Argon2id, segredo do webhook em cofre |
| A05 Injeção | Zod, consultas parametrizadas, escape na saída |
| A06 Design inseguro | Preço e total no servidor, idempotência, modelagem de ameaças por módulo |
| A07 Autenticação | Limite de tentativas, 2FA no admin, sessões revogáveis |
| A08 Integridade | Webhook com HMAC e reconsulta, uploads assinados |
| A09 Log e alerta | Sentry com contexto, alertas de pico de 401 e 403 |
| A10 Condições excepcionais | Negar por padrão, timeouts, erros sem detalhe interno para o usuário |

### LGPD

- A WebEsfera é **controladora** dos dados do restaurante (cadastro, cobrança) e **operadora** dos dados dos clientes finais, em nome de cada restaurante.
- Do cliente final: mesa, itens, observações e horário; sem nome, telefone ou localização guardada.
- Logs e eventos do Sentry sem e-mail, CPF/CNPJ, token de QR ou cookie (limpeza no `beforeSend`).
- Contrato de operador nos termos de uso, política de privacidade, canal do titular e retenção da seção 3. Tudo revisado por advogado antes do lançamento.
- Incidente: avaliar em até 24 h e avisar os restaurantes afetados; a comunicação à ANPD segue a Resolução CD/ANPD nº 15/2024.

## 6. Acessibilidade e usabilidade

A meta é a WCAG 2.2 nível AA no cardápio, no painel e no admin. O vídeo que toca sozinho e a cor escolhida pelo restaurante são os dois riscos novos; os dois já têm regra no protótipo.

| Critério | Como se aplica |
| --- | --- |
| 2.2.2 Pausar, parar, ocultar | Botão de pausa em todo vídeo; com `prefers-reduced-motion`, só a capa e "Reproduzir" |
| 1.4.3 e 1.4.11 Contraste | Tokens já passam; a cor da marca só é publicada com 4,5:1 no texto e 3:1 no fundo |
| 1.4.4 e 1.4.10 Zoom e reflow | Funciona com 200% de zoom e em 320 px; o zoom nunca é bloqueado |
| 2.4.7 e 2.4.11 Foco visível e não encoberto | Anel `--cor-foco`; as barras fixas não cobrem o foco (`scroll-padding`) |
| 2.5.8 Tamanho do alvo | Mínimo da norma: 24 px; o produto usa 44 px |
| 3.2.6 Ajuda consistente | "Chamar garçom" sempre no mesmo lugar |
| 3.3.7 Entrada redundante | Mesa e observações não são pedidas de novo |
| 3.3.8 Autenticação acessível | Aceita colar senha e gerenciador de senhas; sem quebra-cabeça |
| 4.1.3 Mensagens de status | "Pedido enviado" e mudanças de chamado anunciadas por `aria-live` |

### Regras de implementação

- Elementos nativos (`button`, `a`, `input` com `label`); nunca `onClick` em `div`.
- Um `h1` por página, marcos de navegação e `lang="pt-BR"`.
- Botões só de ícone com `aria-label` ("Pausar vídeo do prato").
- Folha do carrinho prende o foco e o devolve ao fechar.
- Erro de formulário em texto e ícone, ligado ao campo por `aria-describedby`, e o foco vai ao primeiro erro.
- Alerta sonoro do painel sempre acompanhado de aviso visual; nada pisca mais de três vezes por segundo.

### Testes

| Quando | O quê |
| --- | --- |
| A cada commit | `eslint-plugin-jsx-a11y` e axe nos testes de componente |
| A cada pull request | Playwright com `@axe-core/playwright` nas telas principais |
| Antes de cada versão | Roteiro manual: teclado, VoiceOver no iPhone, TalkBack no Android, 200% de zoom, movimento reduzido |
| Por trimestre | Sessão com 2 ou 3 pessoas que usam tecnologia assistiva |

## 7. Tecnologias, APIs e integrações

A pilha é a que você definiu (React, Node, PostgreSQL, Redis, Sentry, CSS puro), completada com bibliotecas maduras para cada lacuna. Versões exatas são fixadas no módulo M00, conferidas na documentação oficial no dia, nunca de memória.

### Pilha

| Camada | Escolha | Alternativa avaliada | Motivo |
| --- | --- | --- | --- |
| Runtime | Node 24 LTS; migrar para o Node 26 quando virar LTS ativo | Node 22 | O 24 tem suporte de segurança até 30/04/2028 ([endoflife.date](https://endoflife.date/nodejs)) |
| Linguagem | TypeScript estrito | JavaScript com JSDoc | Tipos de ponta a ponta com os contratos Zod |
| Front | React + Vite + React Router | Next.js | Três SPAs leves; o servidor é a API, não o front |
| Dados no front | TanStack Query | Redux | Cache, reenvio e estados de carregamento prontos |
| Estilo | CSS Modules + variáveis CSS | Tailwind (vetado) | Pedido do briefing; tema por variável |
| HTTP | Fastify | Express 5 | Validação por esquema, hooks e desempenho |
| Validação | Zod em `pacotes/contratos` | Joi, Yup | Um esquema para servidor, front e filas |
| Banco | PostgreSQL + Drizzle (SQL explícito) | Prisma | Controle de `set_config` e RLS por transação |
| Redis | ioredis | node-redis | Exigido pelo BullMQ |
| Filas | BullMQ (código aberto) | BullMQ Pro, RabbitMQ | Redis já está na pilha; limite por restaurante feito por nós (seção 9) |
| Tempo real | SSE + Redis pub/sub | WebSocket, Ably | O painel só recebe; SSE reconecta sozinho e passa por proxy |
| Logs | pino, em JSON | winston | Rápido e estruturado; o Sentry recebe os erros |
| Erros | Sentry v11 (`@sentry/node`, `@sentry/react`) | Datadog | Versão principal atual em 2026 ([releases](https://releases.sh/sentry/sentry-javascript/highlights)) |
| Vídeo | FFmpeg no worker + armazenamento com CDN (Bunny ou R2, decidido no M07) | Cloudflare Stream, Mux | Cobrança por GB é muito mais barata para loops curtos |
| Pagamento | Mercado Pago Assinaturas, SDK oficial `mercadopago` | Asaas, Stripe | Pedido do briefing; o SDK pede Node 18 ou maior ([README](https://cdn.jsdelivr.net/npm/mercadopago@3.6.0/README.md)) |
| E-mail | Resend ou Amazon SES, atrás de uma porta | SMTP próprio | Entregabilidade |
| Testes | Vitest, Testcontainers, Playwright, MSW, Storybook | Jest, Cypress | Rápidos e com Postgres e Redis reais |

### Assinatura pelo Mercado Pago

1. O restaurante escolhe o plano no fim do teste e a API cria a assinatura no Mercado Pago com `external_reference = restaurante_id`. Há dois fluxos na referência: assinatura ligada a um plano (`preapproval_plan_id`, com checkout pelo `init_point`) ou sem plano, onde `card_token_id` é obrigatório ([referência](https://www.mercadopago.com/developers/en/reference/subscriptions/_preapproval/post)). A proposta é usar planos do Mercado Pago (um por plano nosso, guardado em `planos.mp_plano_id`); o fluxo exato é confirmado na documentação no M10, antes de codar.
2. O Mercado Pago chama o webhook com os tópicos `subscription_preapproval` (vínculo), `subscription_authorized_payment` (cada cobrança) e `payment` ([webhooks](https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks)).
3. A API valida a assinatura HMAC (seção 5), grava o evento, põe na fila `pagamentos` e responde 200.
4. O worker busca o recurso (`/preapproval/search`, `/authorized_payments/{id}` ou `/v1/payments/{id}`), aplica a transição em `assinaturas` e `cobrancas` numa transação e emite `PagamentoConfirmado`.
5. O acesso do restaurante muda só por esse caminho. Uma conciliação diária compara cobranças abertas com a API, para cobrir webhook perdido.
6. Sem resposta, o Mercado Pago tenta de novo a cada 15 minutos e depois com intervalo maior. Como uma nova tentativa pode vir com outro `x-request-id`, a proteção contra processar duas vezes é de estado: o worker reconsulta o recurso e só aplica a transição se a situação mudou, numa transação com trava na linha da assinatura.

Os nomes exatos de campos e classes do SDK são conferidos na documentação oficial no módulo M10, antes de codar.

### Contratos da API

- REST com JSON em `/api/v1`; esquemas em `pacotes/contratos`; OpenAPI gerado a partir deles.
- Erros no formato Problem Details (RFC 9457), com `codigo` estável e `id_rastreio` (o mesmo id do evento no Sentry).
- `Idempotency-Key` obrigatória em criação de pedido, chamado e cobrança manual.
- Paginação por cursor; limites de taxa por IP, mesa e restaurante, com `429` e `Retry-After`.
- Versão na URL; mudança que quebra ganha `/v2` e convive por 6 meses.
- Eventos de tempo real com `tipo`, `id`, `restaurante_id`, `ocorrido_em`, `versao` e `dados`.

### Troca de dependências

Cada serviço externo fica atrás de uma porta, com um adaptador real, um falso para testes e um teste de contrato que roda nos dois. Trocar Mercado Pago, provedor de vídeo ou e-mail é escrever um adaptador novo; casos de uso e telas não mudam.

### Ideias além do briefing

| Ideia | Ganho | Situação |
| --- | --- | --- |
| PWA no painel (instalável no celular do garçom) | Abre como app, sem loja; alerta de chamado | Recomendado. No iPhone, a notificação push só funciona com o painel instalado na tela inicial: testar no piloto |
| Cardápio em cache offline (service worker) | Abre mesmo com o Wi-Fi do salão ruim | Recomendado para o M06; o pedido continua exigindo rede |
| Transições de tela (View Transitions API) | Passagem suave do cardápio para o prato | Melhoria progressiva: navegação dentro da SPA funciona em Chrome, Safari 18+ e Firefox 144+; quem não suporta só não anima ([fonte](https://www.xictron.com/en/blog/view-transitions-api-page-transitions-shop-2026/)) |
| Imagens AVIF e WebP com `srcset` | Cardápio mais leve no 4G | Recomendado; gerado no worker junto com o vídeo |
| IA para descrição e tradução do prato | Dono escreve menos; base para os idiomas da V1.1 | V1.1: sugestão que o dono aprova, nunca publicação automática |
| Vídeo gerado a partir de uma foto | Resolve o maior risco: o dono que não sabe filmar | Testar antes de prometer; custo e qualidade não medidos |
| Painel de filas (Bull Board) no admin | Ver jobs travados e reprocessar sem terminal | Recomendado; atrás do login de admin |
| Feature flags (GrowthBook ou Unleash, código aberto) | Ligar recurso novo só para os pilotos | Recomendado a partir do M12 |
| Renovate para dependências | Atualizações em pull requests pequenos | Recomendado no M00 |
| Testes de mutação (Stryker) no domínio | Prova que os testes pegam erro de verdade | Opcional, só em `pacotes/dominio` |

## 8. Qualidade, testes e tratamento de erros

Três redes trabalham juntas: os tipos e o lint pegam o erro antes de rodar, os testes automáticos pegam antes do deploy, e o Sentry pega em produção, com contexto suficiente para corrigir sem reproduzir. Nenhum módulo é aceito sem as três.

### Como os erros são tratados

| Tipo de erro | Exemplo | Tratamento | Vai ao Sentry? |
| --- | --- | --- | --- |
| Erro de negócio esperado | Prato esgotado, mesa fechada, cor sem contraste | O caso de uso devolve `Resultado.falha(ErroDeNegocio)`; a rota vira 409 ou 422 com mensagem clara | Não (é regra, não falha) |
| Entrada inválida | Corpo sem campo obrigatório | Zod recusa na borda; 400 com os campos errados | Não, só a contagem |
| Acesso negado | Papel sem permissão, violação de RLS | 403; violação de RLS é bug grave | Sim, nível `fatal` para RLS |
| Falha de dependência | Mercado Pago fora, Redis lento | Nova tentativa com espera crescente e disjuntor; depois, erro tratado | Sim, `error`, com o provedor e a tentativa |
| Bug | `undefined` onde não podia | Cai no tratador global | Sim, `error`, com tudo abaixo |

**Regra do `try/catch`:** ele só existe em quatro lugares: o tratador global da API, o envoltório dos processadores de fila, os adaptadores de serviços externos (para traduzir o erro do provedor) e as fronteiras de erro do React (`ErrorBoundary`). Fora disso é proibido capturar e ignorar. Um `catch` sem relançar nem reportar quebra o lint (regra própria no `pacotes/config`).

### Erros tipados (pacote `observabilidade`)

```ts
export class ErroAplicacao extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly contexto: {
      modulo: string;
      casoDeUso?: string;
      restauranteId?: string;
      entidade?: string;
      entidadeId?: string;
      dados?: Record<string, unknown>;
    },
    readonly causa?: unknown,
  ) {
    super(mensagem, { cause: causa });
    this.name = new.target.name;
  }
}

export class ErroDependenciaExterna extends ErroAplicacao {}
export class ErroIsolamentoInquilino extends ErroAplicacao {}
export class ErroInvarianteDominio extends ErroAplicacao {}
```

### Como uma falha chega ao Sentry

Todo evento leva o mesmo conjunto de informações, para você saber onde, quem e por quê sem abrir o código:

| Campo no Sentry | Conteúdo | Exemplo |
| --- | --- | --- |
| Título | Classe + código + mensagem em português | `ErroDependenciaExterna: PAGAMENTO_CONSULTA_FALHOU - Mercado Pago não respondeu ao buscar a cobrança` |
| Tags | `app`, `modulo`, `caso_de_uso`, `restaurante_id`, `fila`, `job_id`, `rota`, `codigo` | `app=worker`, `modulo=assinaturas`, `fila=pagamentos` |
| Contexto `negocio` | Entidade e id afetados, situação antes e depois | `assinatura 018f…, situacao=ativa` |
| Contexto `dependencia` | Provedor, endpoint, status HTTP, tempo, tentativa | `mercadopago GET /authorized_payments/{id} 503 em 2.140 ms, tentativa 3 de 5` |
| Breadcrumbs | Passos antes da falha: rota, consultas, jobs | `webhook recebido > assinatura válida > job criado > consulta falhou` |
| Stack trace | Arquivo e linha do código-fonte TypeScript | Source maps enviados pelo CI a cada release |
| Release e ambiente | Commit e `producao`, `homologacao` ou `preview` | `release=api@1.4.2+a1b2c3d` |
| Agrupamento (fingerprint) | `codigo` + `modulo`, para não virar um alerta por pedido | Um problema, N ocorrências |
| Trace | A requisição ou o job inteiro, ligando front, API e worker | Ver em que etapa o tempo foi gasto |

O `beforeSend` remove cookies, corpo da requisição, token do QR, e-mail e documento. O `restaurante_id` vai como tag, que não é dado pessoal.

### Alertas configurados

| Alerta | Gatilho | Para quem |
| --- | --- | --- |
| Isolamento quebrado | Qualquer `ErroIsolamentoInquilino` | Notificação imediata |
| Webhook com assinatura inválida | Mais de 5 em 10 min | Imediata (possível ataque) |
| Pagamento não processado | Job da fila `pagamentos` na fila de falhas | Imediata |
| Taxa de erro | Acima de 1% por 5 min, por app | Imediata |
| Novo problema na release | Primeira ocorrência depois de um deploy | Resumo por e-mail |
| Restaurante concentrando erros | Mais de 20 erros de um `restaurante_id` em 1 h | Resumo |

### Pirâmide de testes

| Tipo | Cobre | Ferramenta | Quando |
| --- | --- | --- | --- |
| Unitário | Domínio: máquinas de estado, dinheiro, contraste da cor, regras de assinatura | Vitest + fast-check (propriedades) | A cada commit |
| Integração | Repositórios e RLS contra Postgres real; filas contra Redis real | Vitest + Testcontainers | A cada pull request |
| Contrato | API contra o OpenAPI; adaptador real contra o falso; webhook com payloads reais do Mercado Pago | Vitest + MSW | A cada pull request |
| Componente | Componentes do `ui` em todos os estados, com axe | Vitest + Testing Library + Storybook | A cada pull request |
| Ponta a ponta | Do QR ao pedido; chamado na fila; assinatura até "ativa" | Playwright (Chromium, WebKit, Firefox) | Fumaça no PR, completo toda noite |
| Carga | Sábado à noite com todos os restaurantes | k6 | Antes do piloto e de cada fase |
| Regressão | Todo bug corrigido ganha um teste que falhava antes | Qualquer um acima | Junto da correção |

Meta de cobertura: 90% em `dominio` e `aplicacao`. Nas outras camadas vale a lista de testes críticos, não a porcentagem.

### Testes que protegem o negócio

- Toda tabela com `restaurante_id` tem RLS forçado e política, e A não lê, altera nem grava dados de B.
- Duas requisições com a mesma `Idempotency-Key` geram um pedido só.
- O mesmo aviso entregue duas vezes, inclusive com x-request-id diferente, muda a assinatura uma vez só; assinatura HMAC errada recebe 401.
- Pagamento confirmado pelo webhook mas recusado na consulta à API não libera acesso.
- Cor da marca sem contraste é recusada pelo caso de uso, mesmo se o front deixar passar.
- Com o Redis fora, o cardápio continua abrindo direto do banco, e o painel cai para consulta a cada 5 s.
- 500 pedidos simultâneos de 50 restaurantes: nenhum perdido, nenhum duplicado, numeração sem salto.

### Lint, análise e revisão

- TypeScript estrito (`strict`, `noUncheckedIndexedAccess`), ESLint com fronteiras de camada, acessibilidade, sem `any` e sem `console`; Prettier.
- `madge` para dependência circular, `jscpd` para código duplicado, gitleaks para segredos, auditoria de dependências.
- Pull request com até cerca de 400 linhas, checklist (testes, migração segura, acessibilidade, dado pessoal novo, entrada validada, erro reportado) e sua aprovação.

## 9. Desempenho, escalabilidade e confiabilidade

O pico é um sábado à noite com todos os restaurantes servindo ao mesmo tempo. A estratégia tem quatro camadas: ler quase tudo do cache, gravar o pedido de forma curta e idempotente, mandar para fila o que pode esperar e limitar quem abusa sem afetar os outros.

### O caminho de um pedido no pico

1. O cliente envia o pedido com `Idempotency-Key`. O limite de taxa por mesa e por restaurante (Redis, janela deslizante) recusa o excesso com 429.
2. A API valida com Zod, abre a transação com o `restaurante_id`, confere preços e disponibilidade, grava `pedidos`, `itens_pedido` e um registro em `caixa_saida`, e responde em cerca de 100 ms. Nada de fila aqui: o cliente precisa saber na hora se deu certo.
3. O publicador da `caixa_saida` (no worker) lê os eventos pendentes com `FOR UPDATE SKIP LOCKED` e publica no Redis pub/sub e nas filas.
4. Toda instância da API que tem um painel daquele restaurante conectado recebe pelo pub/sub e entrega pelo SSE em até 2 s.
5. Se o processo cair entre o passo 2 e o 3, o evento continua na `caixa_saida` e é publicado na volta. Nenhum chamado se perde.

### Filas (BullMQ)

| Fila | O que faz | Concorrência inicial | Tentativas | Observação |
| --- | --- | --- | --- | --- |
| `pagamentos` | Processa webhooks do Mercado Pago e a conciliação | 5 | 8, espera exponencial | `jobId` = tópico + id do recurso + ação: o mesmo aviso não entra duas vezes na fila; o worker ainda confere a situação antes de aplicar |
| `midia` | Transcodifica vídeo, gera capa, AVIF e WebP | 1 por núcleo | 5 | Limite de 2 min por arquivo; falha mantém a foto |
| `notificacoes` | Web Push, e-mails, avisos de cobrança | 10 | 5 | Limite global por provedor |
| `caixa-saida` | Publica eventos pendentes | 1 (repetido a cada segundo) | Contínuo | Um só ativo por vez, com trava no Redis |
| `rotinas` | Expirar sessões, encerrar testes, conciliação diária, limpeza | 2 | 3 | Jobs agendados (repeatable) |
| `relatorios` (V1.1) | Agregados diários | 2 | 3 | Fora do horário de pico |

Regras de todas as filas: payload validado por Zod na entrada e na saída; job idempotente (a chave inclui o id do recurso e a versão); depois das tentativas, vai para a fila de falhas com alerta no Sentry; `removeOnComplete` e `removeOnFail` com limite, para o Redis não crescer sem fim.

### Justiça entre restaurantes

No BullMQ de código aberto não existe limite por grupo; ele foi removido na versão 3 e só existe no BullMQ Pro, que é pago ([fonte](https://oneuptime.com/blog/post/2026-01-21-bullmq-rate-limiting/view)). Para um restaurante grande não atrasar os outros:

- Limite por restaurante antes de enfileirar (token bucket no Redis): quem passa do limite tem os jobs atrasados com `delay`, não descartados.
- Prioridade: jobs de tempo real e pagamento têm prioridade maior que mídia e relatórios.
- Filas separadas por tipo, cada uma com a sua concorrência, para o vídeo pesado não travar o aviso do garçom.
- Se o volume crescer, migrar para BullMQ Pro e usar grupos por `restaurante_id`, sem mudar os casos de uso (fica atrás da porta `FilaDeJobs`).

### Metas

| Indicador | Meta |
| --- | --- |
| LCP do cardápio (p75, 4G) | Até 2,5 s |
| JavaScript da rota do cardápio | Até 170 KB comprimidos |
| Vídeo de cada prato | Até cerca de 600 KB, só os visíveis carregam |
| API, leitura e escrita (p95) | 300 ms e 500 ms |
| Pedido ou chamado no painel (p95) | 2 s |
| Webhook do Mercado Pago respondido | Menos de 1 s (o limite deles é 22 s) |
| Capacidade testada | 100 req/s e 3.000 conexões SSE, com pico de 500 pedidos em 1 minuto |
| Disponibilidade | 99,9% ao mês |

### Falhas e degradação

| Falha | O que a pessoa vê | O que o sistema faz |
| --- | --- | --- |
| Redis fora | Cardápio abre um pouco mais lento; painel em "Atualização lenta" | Leitura direto do banco; painel consulta a cada 5 s; eventos ficam na `caixa_saida` |
| API fora | Cardápio abre pelo cache do navegador; pedido mostra "Sem conexão" | Carrinho guardado; reenvio com a mesma chave |
| Mercado Pago fora | Nada para o cliente final | Webhooks voltam a chegar; a conciliação diária fecha o que faltou |
| Worker parado | Vídeo fica "Processando" por mais tempo | Pedido e chamado não dependem do worker para gravar; alerta após 15 min |
| Banco lento | Respostas mais lentas | Pool de conexões limitado, `statement_timeout` de 5 s e disjuntor |

### Crescimento

| Etapa | Gatilho | Ação |
| --- | --- | --- |
| Até 20 restaurantes | Início | 2 instâncias da API, 1 worker, Postgres e Redis pequenos |
| 20 a 100 | CPU acima de 60%, conexões acima de 70%, fila com mais de 15 min | Mais instâncias, pooler de conexões, workers por fila, Redis dedicado às filas |
| Mais de 100 | Os mesmos gatilhos, medidos | Réplica de leitura, particionar `pedidos` por mês, BullMQ Pro com grupos |

## 10. Infraestrutura, DevOps e entrega contínua

Tudo roda em contêiner, descrito em código, e só chega à produção pelo pipeline. A mesma imagem que passou na homologação é a que vai para a produção.

### Ambientes

| Ambiente | Para quê | Dados | Como sobe |
| --- | --- | --- | --- |
| Local | Desenvolvimento do Claude Code e seu | Seeds fictícios | `docker compose up`: Postgres, Redis, armazenamento emulado e Mercado Pago em modo de teste |
| Pré-visualização | Revisar cada pull request | Banco temporário com seeds | Automático no PR, removido ao fechar |
| Homologação | Ensaio igual à produção, carga e ponta a ponta | Fictícios; credenciais de teste do Mercado Pago | A cada merge na `main` |
| Produção | Restaurantes reais | Reais | Promoção aprovada da imagem da homologação |

### Hospedagem (decidida no M00 com cotação)

| Peça | Proposta |
| --- | --- |
| API, worker e as três SPAs | Plataforma de contêineres gerenciada, região São Paulo quando houver |
| PostgreSQL | Gerenciado, com backup automático |
| Redis | Gerenciado, com persistência (as filas não podem sumir num reinício) |
| Mídia | Bunny ou Cloudflare R2 com CDN |
| DNS, TLS e WAF | Cloudflare, com limite de taxa nas rotas públicas |
| Segredos | Cofre do provedor |
| Infraestrutura como código | Terraform ou OpenTofu no que tiver API |

### Git e commits

- Fluxo em tronco: `main` sempre publicável; branches `modulo/mNN-nome`, `fix/...` e `feat/...` de vida curta.
- `main` protegida: sem push direto, checks obrigatórios, sua aprovação, squash.
- Commits convencionais geram versão e changelog.

### Pipeline

| Etapa | Verifica | Bloqueia se |
| --- | --- | --- |
| PR e CI | Formatação, tipos, lint (fronteiras, a11y, sem emoji), testes unitários, de integração com RLS e de contrato, axe, duplicação, ciclos, segredos, dependências, build e orçamento de JavaScript | Qualquer falha |
| Pré-visualização | Revisão visual | Você não aprova |
| Imagem | Build único com o commit na etiqueta; source maps enviados ao Sentry | Build falha |
| Homologação | Migração, ponta a ponta completo, Lighthouse CI, carga noturna | Teste ou meta quebrada |
| Produção | Migração só de expansão, entrada gradual, checagem de saúde | Checagem falha: rollback automático |
| Depois | Sentry e métricas por 30 min | Alerta dispara o rollback |

Uma regra do lint procura emojis (faixa Unicode de pictogramas) em código, textos e documentação e falha o build; um hook de commit (commitlint) faz a mesma checagem nas mensagens de commit.

### Deploy e rollback

- Entrada gradual: uma instância recebe a versão nova; se ficar saudável, o resto segue.
- Rollback para a imagem anterior em até 5 minutos; funciona porque a migração só expande.
- Feature flags por restaurante para ligar recurso novo nos pilotos primeiro.
- Janela de calma: sem deploy de sexta e sábado entre 18h e 23h, nem em véspera de feriado.

### Monitoramento

| Sinal | Ferramenta | Alerta |
| --- | --- | --- |
| Erros e traces | Sentry | Seção 8 |
| Disponibilidade | Teste externo por minuto no cardápio, no painel e no webhook | Duas falhas seguidas |
| Filas | Métricas do BullMQ e Bull Board | Job mais antigo com mais de 15 min; fila de falhas não vazia |
| Banco e Redis | Métricas do provedor | CPU, conexões, memória e disco acima de 70% |
| Custo | Gasto diário de mídia e dados | Acima de 1,5 vez a média da semana |

Logs em JSON (pino) com `id_rastreio`, `restaurante_id` e `modulo`, sem dado pessoal, e o mesmo `id_rastreio` no Sentry e na resposta de erro para o usuário.

## 11. Plano de execução por módulos

O sistema é construído em 18 módulos, na ordem abaixo. Cada módulo é um prompt para o Claude Code, roda em uma branch própria e só é aceito quando o critério de pronto passa no CI e você aprova o pull request. Primeiro a fundação que protege tudo (erros, banco isolado, filas), depois o cardápio, depois o dinheiro e o tempo real.

&#91;embedded content: fases e portões · 18 módulos em 5 fases\]

O primeiro portão é o mais importante: se o isolamento entre restaurantes não estiver provado por teste, nada de negócio começa. Assinaturas (M10) pode correr em paralelo com o Cardápio, porque só depende da Fundação.

### Módulos

| Módulo | Entrega | Depende de | Tamanho | Pronto quando |
| --- | --- | --- | --- | --- |
| M00 Fundação | Monorepo, TypeScript, lint (fronteiras, a11y, emoji), Docker Compose, CI, `CLAUDE.md`, Renovate | Nenhum | M | CI verde num PR vazio; `docker compose up` sobe tudo |
| M01 Observabilidade | Erros tipados, logger, Sentry na API, no worker e no React, tratador global, `beforeSend` | M00 | M | Um erro de teste aparece no Sentry com tags, contexto e linha do TS |
| M02 Banco e isolamento | Migrações base, papéis, RLS, `comRestaurante()`, teste de acesso cruzado | M00, M01 | G | Teste de isolamento passa e quebra se uma tabela nova vier sem política |
| M03 Design system | `tokens.css`, componentes base, ícones SVG, Storybook, testes visuais e axe | M00 | G | Todos os componentes em todos os estados, sem erro do axe |
| M04 Identidade e restaurantes | Cadastro, login do dono, 2FA do admin, sessões, restaurantes, personalização com contraste no servidor | M02 | G | Cor sem contraste recusada pela API; 2FA obrigatório no admin |
| M05 Filas e outbox | BullMQ, worker base, publicador da `caixa_saida`, limite por restaurante, fila de falhas | M01, M02 | M | Evento sobrevive a queda do processo; job repetido não duplica |
| M06 Gestão do cardápio | Categorias, pratos, busca sem acento, telas do painel | M03, M04 | G | Dono publica 20 pratos; cache invalidado ao publicar |
| M07 Mídia | Upload assinado, FFmpeg, capa, AVIF/WebP, provedor de entrega, `VideoPrato` | M05, M06 | G | Vídeo de 10 s pronto em até 5 min; arquivo ruim recusado sem travar a fila |
| M08 Mesas e QR | Mesas, tokens, `resolver_token_qr`, cookie de mesa, cadastro de mesas no painel, link por mesa com slug, número e código, QR em PNG (uma ou todas, em ZIP), troca de código, redirecionamento de slug antigo | M04 | M | QR inválido e sessão expirada caem nas telas certas; trocar o número na URL sem o código certo é recusado; PNG lido por câmera de iPhone e Android |
| M09 Cardápio do cliente | App `cardapio`: abertura, lista, busca, prato, fechado, cache offline | M03, M06, M07, M08 | G | LCP até 2,5 s no 4G; telas 1.1 a 2.3 iguais ao protótipo |
| M10 Assinaturas | Planos, teste de 10 dias, Mercado Pago, webhook com HMAC, conciliação, inadimplência | M04, M05 | G | Webhook repetido muda o estado uma vez; HMAC errado recebe 401 |
| M11 Pedidos | Carrinho, `CriarPedido` idempotente, numeração, estados, sem conexão | M05, M08, M09 | G | 500 pedidos simultâneos sem perda nem duplicata |
| M12 Atendimento e conta | Chamados, resumo da conta, taxa, divisão, "Avaliar no Google" | M11 | M | Toque duplo não cria segundo chamado |
| M13 Tempo real e fila | SSE, Redis pub/sub, fila do painel, modo TV, PWA e push | M05, M11, M12 | G | Chamado no painel em até 2 s (p95) com 300 painéis conectados |
| M14 Personalização no painel | Tela 4.2 com prévia ao vivo | M03, M04 | M | Prévia igual ao cardápio real |
| M15 Admin da plataforma | Visão geral, restaurantes, detalhe, cobranças, suporte auditado, mesas e links de cada restaurante, Bull Board | M04, M10 | G | Toda ação do admin grava auditoria |
| M16 Endurecimento | Carga k6, revisão OWASP, roteiro manual de acessibilidade, LGPD, teste de restauração | Todos | M | Metas da seção 9 cumpridas no teste de sábado |
| M17 Piloto e lançamento | Produção, flags, onboarding, guia de gravação, página de status | M16 | M | 3 a 5 restaurantes usando, um pagando |

Tamanho: M de 3 a 5 sessões do Claude Code, G de 6 a 10, contando revisão e correções. É uma estimativa de ordem de grandeza; refaça depois do M02.

### Modelo de prompt de cada módulo

Todo prompt segue estas seções, nesta ordem. O Claude Code lê o `CLAUDE.md` antes de tudo, então o prompt não repete as regras fixas.

1. **Contexto:** o que já existe (módulos aceitos) e onde está.
2. **Objetivo:** o resultado em uma frase.
3. **Escopo:** o que entra e o que fica de fora, explicitamente.
4. **Antes de codar:** documentação oficial a conferir (versões, APIs), arquivos existentes a ler e perguntas a fazer, se houver ambiguidade.
5. **Arquivos:** caminhos a criar ou alterar, por camada.
6. **Regras de negócio:** numeradas, com o que acontece no erro.
7. **Contratos:** esquemas Zod, rotas, eventos e jobs, com exemplos.
8. **Erros e Sentry:** quais `ErroAplicacao` existem, códigos, tags e contexto de cada falha.
9. **Testes obrigatórios:** lista nomeada de testes que precisam existir e passar.
10. **Critério de pronto:** comandos que você roda para conferir.
11. **Proibido:** o que não fazer neste módulo.
12. **Entrega:** branch, commits e a descrição do PR (o que mudou, como testar, riscos).

### Arquivo `CLAUDE.md` (raiz do repositório)

```markdown
# Cardápio WebEsfera: regras do projeto

## Produto
SaaS de cardápio por QR Code para vários restaurantes. Isolamento entre
restaurantes é a regra mais importante do sistema.

## Pilha
TypeScript estrito. React + Vite + React Router + TanStack Query nos apps.
Node 24 LTS + Fastify na API. PostgreSQL + Drizzle. Redis + BullMQ.
Zod para toda entrada. Sentry em API, worker e apps. CSS Modules com
variáveis CSS de pacotes/ui/src/tokens.css. Tailwind é proibido.

## Arquitetura
Camadas: interface -> aplicacao -> dominio. infraestrutura implementa as
portas da aplicacao. dominio não importa nada externo. Um caso de uso por
arquivo. Módulos conversam por casos de uso e eventos, nunca pela tabela
de outro módulo.

## Regras invioláveis
- restaurante_id vem da sessão autenticada, nunca da URL, query ou corpo.
- Todo acesso a dado de restaurante passa por comRestaurante(); nunca use o
  papel de banco das migrações na aplicação.
- Preço e total são calculados no servidor.
- Criação de pedido, chamado e cobrança exige Idempotency-Key.
- Webhook do Mercado Pago: validar HMAC, gravar evento, enfileirar,
  responder 200, e só o worker muda a assinatura após consultar a API.

## Código
- Identificadores, arquivos, tabelas e colunas em português do Brasil, sem
  acento. Exceção: nomes exigidos por framework ou biblioteca.
- Sem comentários, salvo decisão não óbvia com link para docs/adr.
- Sem emoji em código, textos, interface, commits e documentação. Ícones
  só do pacote ui, em SVG.
- Cores e espaçamentos só por variável CSS. Nenhum hex fora de tokens.css.
- Funções curtas; sem any; sem console (use o logger).
- Nunca invente API ou comportamento de biblioteca: confira a documentação
  oficial e cite a URL no PR.

## Erros
- Erro de negócio: Resultado.falha(ErroDeNegocio), sem exceção.
- Erro inesperado: lance uma subclasse de ErroAplicacao com codigo,
  modulo, casoDeUso e contexto.
- try/catch só no tratador global, no envoltório de jobs, nos adaptadores
  externos e em ErrorBoundary. Proibido capturar e ignorar.

## Testes
- Todo caso de uso: teste unitário do caminho feliz e de cada falha.
- Todo repositório: teste de integração com Postgres real e RLS.
- Todo bug corrigido: um teste que falhava antes.
- Rode pnpm verificar (lint, tipos, testes) antes de abrir o PR.

## Entrega
Uma branch por módulo (modulo/mNN-nome), commits convencionais, PR com o
que mudou, como testar e riscos. Não avance para fora do escopo do prompt.
```

### Prompt completo do M00 (Fundação)

```markdown
# M00: Fundação do monorepo

## Contexto
Repositório vazio, exceto CLAUDE.md. Leia CLAUDE.md inteiro antes de começar.
O plano completo está em docs/plano.md (seções 2, 7, 8 e 10).

## Objetivo
Um monorepo que compila, passa no lint e nos testes, sobe localmente com um
comando e tem CI bloqueando qualquer PR que quebre as regras do projeto.

## Escopo
Dentro: estrutura de pastas, gerenciador de pacotes, TypeScript, ESLint,
Prettier, Vitest, Docker Compose, CI, regra de emoji (código e commits),
Renovate, scripts.
Fora: qualquer regra de negócio, tabela, tela ou integração. Nada de Sentry
(vem no M01) nem de migrações (M02).

## Antes de codar
1. Confira na documentação oficial as versões estáveis atuais de: Node 24
   LTS, pnpm, TypeScript, Vite, React, Fastify, Vitest, ESLint (flat config),
   eslint-plugin-boundaries, commitlint. Liste as versões e as URLs no PR.
2. Se alguma ferramenta abaixo estiver descontinuada, pare e pergunte.

## Arquivos
- package.json e pnpm-workspace.yaml (apps/*, pacotes/*)
- .nvmrc com a versão do Node 24
- pacotes/config/: tsconfig.base.json (strict, noUncheckedIndexedAccess,
  exactOptionalPropertyTypes), eslint.config.js, prettier.config.js
- pacotes/config/src/ambiente.ts: carregarAmbiente(esquema) com Zod,
  que encerra o processo com mensagem clara se faltar variável
- pacotes/config/eslint/regras/sem-emoji.js: regra própria que falha em
  qualquer caractere de pictograma em strings, JSX e comentários
- pacotes/config/eslint/regras/sem-catch-vazio.js: falha em catch que não
  relança nem chama reportarErro
- commitlint.config.js e hook de commit: exige commits convencionais e
  recusa mensagem com emoji
- apps/api, apps/worker, apps/cardapio, apps/painel, apps/admin: esqueletos
  mínimos que compilam (uma rota /saude na API; uma página "ok" nos apps)
- pacotes/dominio, aplicacao, infraestrutura, contratos, ui,
  observabilidade: index.ts vazio e package.json
- docker-compose.yml: postgres, redis (com appendonly), minio, api, worker
- .env.exemplo com todas as variáveis, sem valores reais
- .github/workflows/ci.yml: instalar, lint, tipos, testes, build, madge,
  jscpd, gitleaks, auditoria, commitlint do PR; ações fixadas por hash
- renovate.json; .editorconfig; docs/adr/0001-monorepo.md

## Regras
1. Fronteiras (eslint-plugin-boundaries): dominio não importa nenhum outro
   pacote; aplicacao só dominio; infraestrutura só aplicacao e dominio;
   apps só aplicacao, contratos, ui, observabilidade e config.
2. Script pnpm verificar roda lint, tipos e testes em todo o monorepo.
3. O CI falha com dependência circular (madge) ou duplicação acima de 3%.

## Testes obrigatórios
- sem-emoji: aceita texto comum, recusa um pictograma em string, JSX e
  comentário.
- sem-catch-vazio: recusa catch vazio e catch só com log; aceita relançar.
- commitlint: recusa mensagem com emoji e mensagem fora do padrão.
- carregarAmbiente: falha com a lista das variáveis faltando.
- fronteiras: um arquivo de teste em dominio importando infraestrutura
  faz o lint falhar (teste do próprio lint).
- api /saude responde 200.

## Critério de pronto
- pnpm install && pnpm verificar passa do zero.
- docker compose up sobe todos os serviços e GET /saude responde 200.
- Um PR de teste com um emoji num texto falha no CI.

## Proibido
Tailwind, qualquer framework de CSS, JavaScript sem tipos, any,
console.log, dependência sem uso, código de negócio.

## Entrega
Branch modulo/m00-fundacao. Commits convencionais. PR com versões
escolhidas e URLs das fontes, como rodar, e riscos conhecidos.
```

Os prompts do M01 em diante seguem o mesmo modelo e são escritos um por vez, depois que o módulo anterior for aceito, a partir do código que existe de verdade.

## 12. Documentação, manutenção e evolução

A documentação mora no repositório e muda no mesmo pull request que muda o comportamento. O que pode ser gerado (contrato da API, dicionário de dados) é gerado, para não envelhecer.

### O que será documentado

| Documento | Onde | Atualiza quando |
| --- | --- | --- |
| `README` e instalação local | `README.md`, `docs/instalacao.md` | Muda ferramenta; meta: rodar do zero em 30 min |
| Plano do produto | `docs/plano.md` (este documento) | A cada fase |
| Decisões (ADR) | `docs/adr/` | Cada decisão relevante |
| Prompts dos módulos | `docs/prompts/mNN-nome.md` | Um por módulo, antes de começar |
| Contrato da API | OpenAPI gerado | Cada mudança; o CI falha se divergir do código |
| Dicionário de dados | `docs/dados/`, gerado do esquema | Cada migração; o CI falha se uma coluna não tiver descrição |
| Filas e eventos | `docs/filas.md` | Fila, job ou evento novo |
| Runbooks | `docs/runbooks/`, um por alerta do Sentry | Depois de cada incidente |
| Central de ajuda | Site | Cada versão: gravar vídeo, imprimir QR, usar o painel, pagar a assinatura |
| Privacidade, termos e LGPD | Site e `docs/lgpd/` | Revisão semestral |

### Manutenção recorrente

| Frequência | Tarefa |
| --- | --- |
| Semanal | Aceitar as atualizações do Renovate; revisar problemas novos no Sentry |
| Mensal | Testar a restauração; conferir conciliação com o Mercado Pago; revisar custo de mídia |
| Trimestral | Sessão de acessibilidade; revisão de permissões, segredos e dependências |
| Semestral | Privacidade e retenção; arquitetura contra os gatilhos de crescimento |
| Anual | Simulado de incidente com os prazos da ANPD |

### Suporte

| Nível | Exemplo | Resposta |
| --- | --- | --- |
| P1 | Restaurante não recebe pedidos ou chamados | Até 30 min no horário de funcionamento |
| P2 | Vídeo não processa; painel lento | Até 4 h úteis |
| P3 | Dúvida de uso | Até 1 dia útil |

### Evolução e descontinuação

- Cerca de 20% de cada ciclo para dívida técnica e atualizações.
- API: versão nova convive com a anterior por 6 meses, com aviso.
- Recurso removido: aviso, desligado por flag, e só depois o código sai.
- Node 24 para 26 quando o 26 for LTS ativo, num módulo próprio com testes de regressão.

### Relatório de decisões

| Decisão | Escolha | Alternativa | Por quê |
| --- | --- | --- | --- |
| Arquitetura | Monólito modular em camadas + worker | Microsserviços | Uma pessoa opera; módulos prontos para separar |
| Isolamento | Banco compartilhado com RLS | Banco por restaurante | Menos operação, garantido por teste |
| Linguagem | TypeScript estrito | JavaScript | Tipos de ponta a ponta com uma IA escrevendo o código |
| Estilo | CSS Modules + variáveis | Tailwind | Pedido do projeto; tema por variável |
| Filas | BullMQ no Redis | Fila no Postgres, RabbitMQ | Redis já está na pilha; retentativa, atraso e prioridade prontos |
| Pedido | Gravação síncrona + outbox | Pedido pela fila | O cliente precisa da confirmação; o outbox não perde evento |
| Tempo real | SSE + Redis pub/sub | WebSocket | O painel só recebe; reconexão nativa |
| Pagamento da plataforma | Mercado Pago Assinaturas com webhook HMAC e reconsulta | Asaas, Stripe | Pedido do projeto; o webhook nunca é confiado sozinho |
| Erros | Erros tipados + Sentry com contexto | Logs soltos | Cada falha diz onde, quem e por quê |
| Personalização | Só cor da marca, logo e identidade | Tema livre | Legibilidade garantida e onboarding rápido |

### Decisões em aberto

| Decisão | Até quando |
| --- | --- |
| Preço e limites dos planos | Antes do M10 |
| Nome comercial e domínio do produto (vão impressos em todo QR de mesa; trocar depois exige redirecionamento permanente) | Antes de imprimir o primeiro QR do piloto |
| Provedor de mídia (Bunny ou R2) | No M07 |
| Hospedagem e região | No M00 |
| Prazos de inadimplência (dia 1 e dia 15) | Antes do M10 |
| Como a equipe do salão entra no painel antes dos perfis da V1.1 | Antes do M13 |

## Fontes

- [Mercado Pago: notificações webhook (assinatura, tópicos, retentativas)](https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks)
- [Mercado Pago: criar assinatura (preapproval)](https://www.mercadopago.com/developers/en/reference/subscriptions/_preapproval/post)
- [TabNews: manifesto do x-signature com id em minúsculas](https://www.tabnews.com.br/mss/5e345d47-e76a-449b-84ad-dc65fe55341b)
- [SDK Node do Mercado Pago (README)](https://cdn.jsdelivr.net/npm/mercadopago@3.6.0/README.md)
- [endoflife.date: ciclo do Node.js](https://endoflife.date/nodejs)
- [Sentry JavaScript: versões e novidades](https://releases.sh/sentry/sentry-javascript/highlights)
- [OneUptime: limite de taxa no BullMQ](https://oneuptime.com/blog/post/2026-01-21-bullmq-rate-limiting/view)
- [Xictron: suporte à View Transitions API em 2026](https://www.xictron.com/en/blog/view-transitions-api-page-transitions-shop-2026/)
- [Appwrite: RLS com set\_config transacional e pooler](https://appwrite.io/docs/products/databases/postgresql/concepts/access-control)
- [DEV: armadilhas do RLS multi-tenant](https://dev.to/wenceslaudev/postgres-rls-multi-tenancy-two-traps-that-silently-disable-your-policies-5gn8)
