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

Camadas: interface -> aplicacao -> dominio. infraestrutura implementa
as portas da aplicacao. dominio não importa nada externo. Só
apps/api/src/composicao e apps/worker/src/composicao importam
infraestrutura. Apps React nunca importam aplicacao, dominio nem
infraestrutura. Um caso de uso por arquivo. Módulos conversam por casos
de uso e eventos, nunca pela tabela de outro módulo. Detalhes em
docs/adr/0002.

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

- Erro de negócio: Resultado.falha(ErroDeNegocio), definidos em
  dominio/src/compartilhado, sem exceção.
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
