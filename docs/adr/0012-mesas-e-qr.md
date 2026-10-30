# ADR 0012: Mesas, QR Codes e sessão de mesa

- Situação: proposta (M08)
- Data: 2026-10-29

## Contexto

O M08 entrega a gestão de mesas no painel, o cartão com QR Code de cada mesa,
o ZIP com todos os cartões, a resolução pública do link e a sessão de mesa que
os módulos de pedido e chamado vão usar. As regras do prompt
(`docs/prompts/m08-mesas.md`) valem como requisito. O John ajustou o prompt
antes de codar; as decisões abaixo registram esse ajuste.

| Componente       | Versão | Uso                      |
| ---------------- | ------ | ------------------------ |
| qrcode-generator | 2.0.4  | matriz do QR no servidor |
| yazl             | 3.3.1  | ZIP em fluxo             |
| jsqr             | 1.4.0  | só nos testes, lê o QR   |
| sharp            | 0.35.5 | cartão PNG (já do M07)   |

## Decisões

### O código é a identidade permanente da mesa

Garantia explícita: nenhuma edição de dados invalida um QR impresso. Mudar o
slug do restaurante, renumerar a mesa ou trocar nome e área não muda o código,
e o link antigo continua abrindo a sessão.

- O código tem 16 bytes aleatórios do servidor (`randomBytes`) em base64url,
  22 caracteres. Nunca é gerado no banco.
- `app.resolver_mesa(p_slug, p_numero, p_codigo)` acha a mesa só pelo código.
  Slug e número no link são cosméticos: se não forem os atuais, a resposta é
  `redirecionar` com `slug_atual` e `numero_atual`, e a API devolve 301 para o
  link canônico.
- Situações: `valida`, `redirecionar`, `inativa`, `cancelado` e
  `desconhecido`. As três últimas dão 404 `MESA_ABRIR_QR_INVALIDO`, com a
  mesma mensagem, sem dizer ao visitante qual foi o motivo.

O QR deixa de funcionar só em três casos:

1. o dono gera um novo código (com confirmação na tela). O código velho vira
   `desconhecido` na hora, sem redirecionamento;
2. o dono desativa a mesa. Reativar faz o mesmo QR voltar a funcionar;
3. o restaurante é cancelado.

Os históricos de slug e de número continuam recebendo só slug e número; o
código antigo não vai para histórico nenhum.

### Alerta só para código inexistente

- Cada tentativa de abrir mesa vai para o log com o IP mascarado (`/24` no
  IPv4, `/48` no IPv6) e o desfecho, nunca com o código.
- `desconhecido` incrementa um contador no Redis por origem mascarada
  (`limite:qr_invalido:<sha256>`, janela de 15 minutos). Ao chegar a 20, o
  caso de uso reporta um único `MESA_RESOLUCAO_CODIGO_DESCONHECIDO` ao Sentry,
  com a origem mascarada e a contagem, sem o código. Acima de 20 não repete.
- A rota pública tem limite de taxa por IP (30 por minuto).
- Contar pela origem mascarada agrupa vizinhos de rede. Aceitamos: o alerta
  serve para notar varredura, e o limite de taxa continua por IP exato.

### Sessão de mesa

- Uma sessão aberta por mesa, em `sessoes_mesa`. Quem chega depois reaproveita
  a sessão aberta; a validade de 4 horas conta da primeira abertura. A linha da
  mesa é travada (`FOR UPDATE`) para duas aberturas simultâneas não criarem
  duas sessões. Vencida, a sessão é fechada e outra é aberta.
- Cookie `__Host-sessao_mesa`: o id da sessão assinado com HMAC-SHA256
  (`@fastify/cookie` com `secret`, chave `CHAVE_SESSAO_MESA`), `HttpOnly`,
  `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain`, expirando com a sessão. O
  prefixo `__Host-` prende o cookie ao host do cardápio.
- A sessão de mesa não dá acesso ao painel: o painel só lê
  `__Host-sessao_painel`, e o cookie de mesa nem chega ao host do painel. Há
  teste com o cookie copiado para o host do painel.
- Trocar `CHAVE_SESSAO_MESA` invalida os cookies de mesa já emitidos.
- Desde o M11 (ADR 0015), o valor assinado é `restauranteId:sessaoId`, para
  o pedido abrir `comRestaurante()` sem função privilegiada nova.
- Desde o M12 (ADR 0016), toda sessão fechada tem `motivo_fechamento`:
  `expirada` (tempo) ou `encerrada` (equipe, a partir do M13).

### Limite de mesas pelo plano

- O caso de uso consulta a porta `LimiteDeMesas` ("limite de mesas deste
  restaurante"). Mesas desativadas não contam; reativar respeita o limite.
- Enquanto não há assinatura, o adaptador devolve `LIMITE_MESAS_TESTE = 30`,
  o teto do plano Pro. O M10 troca o adaptador pela leitura de `assinaturas` e
  `planos.limite_mesas`, sem mexer no caso de uso nem nos testes.
- Feito no M10 (ADR 0014): a porta usa `ObterLimiteDeMesas`. Com assinatura
  autorizada, vale o limite do plano; em teste ou pendente, 30.
- A contagem trava a linha do restaurante, para duas criações simultâneas não
  passarem do limite.

### Cartão e ZIP

- QR com correção M, modo byte, margem de 4 módulos, preto puro sobre branco,
  módulos inteiros (sem reamostragem). O QR codifica exatamente o link
  `https://{DOMINIO_CARDAPIO}/{slug}/mesa/{numero}?c={codigo}`; um teste lê o
  PNG com jsQR e compara.
- Nada sobre o QR. O cartão traz o nome do restaurante, "Mesa N", o nome da
  mesa e a instrução, fora da área do código.
- Desvio do prompt, aprovado por enquanto pelo John (2026-10-29): o cartão
  usa o nome do restaurante, não o logo. Buscar o logo no servidor exigiria
  baixar uma URL vinda da personalização, o que abre risco de SSRF. O próximo
  passo (issue #12, M09 ou depois) é ler o logo do nosso bucket de mídia pelo
  adaptador de armazenamento, por chave e nunca por URL externa, e compô-lo
  fora da área do QR. Sem logo, o cartão continua com o nome.
- Sem cache de QR (`qr:`): gerar o cartão custa milissegundos e o cache
  atrasaria a troca de código.
- O ZIP sai em fluxo, sem compressão (PNG já é comprimido), só com mesas
  ativas.
- A imagem da API instala `font-dejavu` para o texto do cartão.

### Admin

`app.admin_listar_mesas(p_administrador_id, p_slug)` é somente leitura, exige
admin ativo com segundo fator cadastrado e grava a consulta na auditoria. A
tela do admin não tem botão nem campo de edição.

### Auditoria

Criar, renumerar (com número antes e depois), ativar, desativar e trocar
código vão para `auditoria`, com o usuário da sessão. A troca de código não
grava o código.

## Consequências

- Um QR impresso só morre por ação explícita do dono ou cancelamento.
- Vazar um link de mesa permite abrir sessão naquela mesa até o dono gerar um
  novo código. Os módulos de pedido devem tratar a sessão de mesa como
  identificação fraca.
- O link aponta para o app do cardápio, que ainda não tem a rota
  `/{slug}/mesa/{numero}`. Até ela existir, a abertura é pela API
  `/api/v1/cardapios/{slug}/mesa/{numero}?c=`.

## Fontes consultadas

- qrcode-generator: https://github.com/kazuhikoarase/qrcode-generator/tree/master/js
- yazl: https://github.com/thejoshwolfe/yazl
- jsQR: https://github.com/cozmo/jsQR
- @fastify/cookie, cookies assinados: https://github.com/fastify/fastify-cookie#options
- Prefixo `__Host-`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes
- sharp, composição: https://sharp.pixelplumbing.com/api-composite
- Pacote Alpine font-dejavu: https://pkgs.alpinelinux.org/packages?name=font-dejavu
