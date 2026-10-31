# Runbook: piloto

Decisões e motivos no [ADR 0017](../adr/0017-intermediario-essencial.md). Aqui
ficam os passos.

Todo passo do admin exige a sessão de admin com segundo fator
(`https://<DOMINIO_ADMIN>/entrar`). O primeiro acesso de um admin está em
[admin.md](admin.md).

## Entrada de um restaurante no piloto

1. No admin, abra **Restaurantes** e preencha **Novo restaurante**:
   - nome;
   - endereço (slug: só letras minúsculas, números e hífens);
   - e-mail do dono.
2. Clique em **Criar e gerar convite**. O restaurante nasce em `teste`, com
   10 dias, e aparece na lista.
3. Copie o link do convite que aparece na tela. Ele **não aparece de novo**,
   vale por **72 horas** e funciona **uma vez só**.
4. Mande o link ao dono por um canal direto (WhatsApp ou e-mail pessoal). Não
   cole o link em grupo nem em chamado.
5. O dono abre o link, cria a senha e entra pelo painel com o e-mail e essa
   senha.

### Quando o convite falha

- **"Este convite expirou, já foi usado ou foi trocado por um novo"**: abra o
  restaurante no admin e clique em **Gerar novo convite**. O anterior deixa de
  valer na hora.
- **E-mail já tem conta**: o admin recusa a criação. Use outro e-mail, ou peça
  ao dono que crie o restaurante pelo próprio painel.
- **Endereço em uso**: escolha outro slug. Slugs antigos também ficam
  reservados.

## Suspender e reativar

Suspenso, o restaurante continua com o cardápio no ar. Chamar o garçom e pedir
a conta continuam funcionando; só os **pedidos novos** são recusados, com a
mensagem para chamar um atendente. É a mesma regra da inadimplência.

1. Abra o restaurante no admin.
2. Escreva o motivo (de 3 a 500 caracteres). Ele fica na auditoria.
3. Clique em **Suspender restaurante**. A situação passa a **Suspenso**.
4. Para voltar, escreva o motivo da reativação e clique em **Reativar
   restaurante**.

Suspensão e reativação ficam no histórico (`suspensoes_restaurante`) e na
`auditoria`, com o admin que fez.

## Cobrança e visão geral

- **Cobrança**, na página do restaurante, é só leitura: a assinatura e as
  últimas 24 cobranças. Mudanças de assinatura seguem o
  [runbook de pagamentos](pagamentos.md).
- **Visão geral**, na lista, mostra os restaurantes por situação e os pedidos
  das últimas 24 h. O link do Sentry aparece quando a variável
  `URL_SENTRY_DO_ADMIN` da API está definida.

## Auditoria

Para conferir quem fez o quê num restaurante (como `cardapio`, pelo
`psql` de operação):

```sql
SELECT criado_em, autor_tipo, autor_id, acao, motivo
  FROM auditoria
 WHERE restaurante_id = (SELECT id FROM restaurantes WHERE slug = '<slug>')
 ORDER BY criado_em DESC
 LIMIT 50;
```

Ações registradas:

- `restaurante.criar`;
- `convite.gerar`;
- `convite.aceitar`;
- `restaurante.suspender`;
- `restaurante.reativar`;
- da fila: `pedido.avancar`, `pedido.cancelar`, `chamado.assumir`,
  `chamado.concluir` e `sessao_mesa.encerrar`.

## Proxy na frente da API: tempo real (SSE)

A fila do painel (`GET /api/v1/tempo-real`) e o status do pedido no cliente
(`GET /api/v1/mesa/tempo-real`) usam Server-Sent Events: a resposta fica aberta
enquanto a tela estiver aberta. A API manda um batimento a cada 25 s. Por isso
o proxy precisa de três ajustes nessas duas rotas:

- **Timeout de leitura acima de 25 s.** Use 60 s. Com um timeout menor que o
  intervalo do batimento, o proxy derruba a conexão entre dois batimentos.
- **Sem buffer de resposta.** A API já envia `X-Accel-Buffering: no`. Se o
  proxy ignorar esse cabeçalho, desligue o buffer na rota; com buffer, os
  eventos chegam atrasados ou em lote.
- **Sem compressão** em `text/event-stream`, pelo mesmo motivo.

Exemplo para nginx, a conferir na documentação da versão em uso
(https://nginx.org/en/docs/http/ngx_http_proxy_module.html):

```nginx
location ~ ^/api/v1/(mesa/)?tempo-real$ {
  proxy_pass http://api;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_read_timeout 60s;
  proxy_buffering off;
  gzip off;
}
```

### Como conferir depois de implantar

1. Abra a tela Fila no painel e espere mais de 1 min. O texto do topo continua
   "Ao vivo".
2. Faça um pedido de teste numa mesa. Ele aparece na coluna "Enviados" em
   poucos segundos, sem recarregar.
3. Se o texto alternar entre "Ao vivo" e "Reconectando" a cada 30 a 60 s, o
   timeout de leitura do proxy está curto.

A fila nunca fica errada por causa do proxy: a cada reconexão o painel
reconsulta o estado, e o cliente tem polling de 10 s quando o SSE não conecta.
Um timeout curto só gera reconexões e atraso.
