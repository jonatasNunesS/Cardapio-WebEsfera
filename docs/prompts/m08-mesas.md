# M08: Mesas, QR Codes e sessão de mesa
## Contexto
M00 a M07 aceitos. O M02 já criou a tabela `mesas`, os históricos de slug e de número, `sessoes_mesa` e a função `app.resolver_mesa`. Falta a gestão no painel, a geração do QR, a abertura da sessão de mesa e as telas.
Leia antes: CLAUDE.md; ADRs 0006, 0008 e 0010; no plano, a seção 1 (subseção "Link e QR Code de cada mesa") e a seção 5 (sessão de mesa); e as telas `Mesas.dc.html`, `Entrada.dc.html` e `QrInvalido.dc.html`.
## Objetivo
O dono cadastra mesas, cada uma com link e QR próprios, exporta o QR em PNG, troca o código quando preciso. O cliente, ao abrir o link do QR, recebe uma sessão de mesa de 4 horas e vê o cardápio; links inválidos ou de histórico caem na tela certa.
## Escopo
Dentro:

* Domínio: `Mesa` (número, nome, área, código, ativa), geração do código (16 bytes aleatórios em base64url, 22 caracteres).
* Casos de uso do painel: criar, editar, ativar/desativar, renumerar e gerar novo código de mesa; listar mesas com o link.
* Geração do QR: PNG por mesa e ZIP com todas; o PNG como cartão (logo, número, QR).
* Resolução pública do link: usa `app.resolver_mesa`; abre a sessão de mesa (cookie assinado, 4 h) quando válido; redireciona no caso de histórico; cai em "QR inválido" no resto, e registra o caso suspeito.
* API: rotas do painel (sessão de dono/gerente) e a rota pública de abertura de sessão de mesa por slug/numero/codigo.
* Painel: tela "Mesas e QR Codes" (lista, nova mesa, cartão do QR, baixar, desativar, novo código com confirmação).
* Admin: a lista de mesas e links no detalhe do restaurante (só leitura).
* ADR 0012.

Fora: pedido e chamado (M11, M12); a tela do cliente montada (M09; aqui a abertura de sessão responde os dados, a tela vem depois); perfis da equipe (V1.1).
## Antes de codar
Confira na documentação oficial e cite as URLs no PR:

1. Biblioteca de QR em Node: `qrcode` (manutenção, saída PNG e SVG, nível de correção de erro, margem, tamanho). Alternativa se estiver abandonada.
2. Geração do PNG do cartão (logo + número + QR): `sharp` (já no projeto desde o M07) compondo as camadas, ou outra. Sem dependência nova se a `sharp` resolver.
3. ZIP em streaming no Node, para não carregar tudo em memória (`archiver` ou equivalente).

## Decisões já tomadas

* O código da mesa é gerado na aplicação, nunca no banco, com `crypto.randomBytes(16)` em base64url. Único por restaurante e global.
* O link é `https://{DOMINIO_CARDAPIO}/{slug}/mesa/{numero}?c={codigo}`. O painel mostra e copia esse link; o QR codifica esse link.
* A resolução sempre passa por `app.resolver_mesa` (slug, numero, codigo) e nunca recebe `restaurante_id`. Três respostas: válida (abre sessão), redirecionar (histórico de slug ou número, 301 para o link atual), inválida (tela de QR inválido). Código existente com slug/numero que não batem é registrado como alerta de segurança (regra do M02).
* Sessão de mesa: cookie assinado `HttpOnly`, `Secure`, `SameSite=Lax`, escopo no host do cardápio, 4 h, guardada em `sessoes_mesa` (uma aberta por mesa). Ela só autoriza ler o cardápio e, nos módulos futuros, pedir e chamar. Não dá nenhum acesso ao painel.
* Gerar novo código invalida o QR antigo na hora (apaga o cache `qr:` e grava o número antigo? não: o código não vai para histórico; só o número e o slug vão). O caso vai para a auditoria. Confirmo no ADR.
* Renumerar a mesa grava o número antigo em `historico_numeros_mesa`, para o QR impresso antigo redirecionar. O código continua o mesmo.
* QR com correção de erro nível médio (M), margem adequada, e o logo fora do QR (no cartão, não sobre o código), para não atrapalhar a leitura.
* Limite do plano: criar mesa além do `limite_mesas` do plano é recusado com `ErroDeNegocio`. Desativar não conta para o limite.

## Testes obrigatórios

* Geração do código: formato (22 caracteres base64url), unicidade, aleatoriedade (sem repetição em muitas gerações).
* Resolução: válida abre sessão; histórico de slug e de número redirecionam; código inexistente, mesa inativa e restaurante cancelado dão inválido; código de A com slug de B dá inválido e gera o alerta.
* Sessão de mesa: cookie com as flags certas; uma aberta por mesa; expira em 4 h; não serve para o painel.
* QR: o PNG decodifica de volta no link exato (teste que lê o QR gerado); o ZIP traz um PNG por mesa ativa.
* Isolamento: mesas e links de A nunca aparecem para B; as rotas do painel nunca recebem `restaurante_id`; a lista do admin é só leitura.
* Limite do plano: a mesa além do limite é recusada; desativar e criar outra respeita o limite.
* Renumerar e gerar novo código: o antigo para de resolver (ou redireciona, no caso do número), e tudo fica na auditoria.
* Telas no Chromium, com axe: criar mesa, ver o cartão, baixar, desativar, gerar novo código com confirmação; a lista do admin.

## Critério de pronto
`pnpm verificar` e CI verdes; demonstração no PR: criar mesas pela API, abrir uma sessão por um link válido, um redirecionamento por histórico, um link inválido, e um PNG e um ZIP gerados (anexe um PNG de exemplo lido de volta no teste). ADR 0012 escrito.
## Proibido
Código da mesa gerado no banco; `restaurante_id` vindo do cliente; logo sobre o QR; sessão de mesa com qualquer acesso ao painel; QR que codifica algo diferente do link; emoji.
## Entrega
Branch da sessão, atualizada a partir da main. Commits por assunto. PR `feat: mesas, QR Codes e sessão de mesa (M08)`, com o que foi criado, URLs, demonstração, riscos e sugestões.
