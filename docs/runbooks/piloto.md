# Runbook: piloto

Decisões e motivos no [ADR 0017](../adr/0017-intermediario-essencial.md). Aqui
ficam os passos. As seções do admin mínimo entram com a parte B do
intermediário.

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
