# ADR 0008: Identidade e sessões

- Situação: aceita (proposta no M04; aceita pelo John em 2026-10-22, com as
  três decisões: admin com identidade própria, redefinição de senha com 503
  sem provedor de e-mail e enumeração no cadastro mitigada por limite de taxa)
- Data: 2026-10-22

## Contexto

O M04 cria as contas dos donos, o login do painel, o login do admin com
segundo fator e as sessões. O admin é o terceiro risco mais caro do produto
(seção 5 do plano). As regras do prompt do M04
(`docs/prompts/m04-identidade.md`) valem como requisito; este ADR registra
como foram cumpridas, o que foi escolhido em cada biblioteca e por quê.

| Componente               | Versão  |
| ------------------------ | ------- |
| @node-rs/argon2          | 2.2.2   |
| otplib                   | 13.5.0  |
| @fastify/cookie          | 11.1.3  |
| @fastify/csrf-protection | 8.0.2   |
| @fastify/rate-limit      | 11.2.1  |
| ioredis                  | 6.0.0   |
| react-router             | 8.4.0   |
| @tanstack/react-query    | 5.104.1 |

`react-router` 8.5.0 e `@tanstack/react-query` 5.104.5 tinham menos de uma
semana quando o M04 começou; ficaram as versões anteriores, mais antigas que a
idade mínima de publicação do pnpm.

## Decisões

### Argon2id: @node-rs/argon2, não argon2

| Critério                 | @node-rs/argon2 2.2.2                            | argon2 0.45.1                                         |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------- |
| Implementação            | Rust (crate `argon2`) via napi-rs                | Código C de referência via node-addon-api             |
| Binário no Alpine (musl) | Pacote opcional `@node-rs/argon2-linux-x64-musl` | Prebuild no próprio pacote (`prebuildify --tag-libc`) |
| Script de instalação     | Nenhum                                           | `install: node-gyp-build`                             |
| Manutenção               | 2.2.2 publicada em 2026-10-06                    | 0.45.1 publicada em 2026-07-21                        |

O que decidiu: o pacote `argon2` precisa de script de instalação, e o projeto
mantém `allowBuilds` fechado no pnpm (ADR 0001). O @node-rs/argon2 entrega o
binário de cada plataforma como dependência opcional, sem rodar nada na
instalação. Os dois são mantidos e produzem o mesmo formato PHC.

Parâmetros: Argon2id, 19 MiB de memória, 2 passadas, paralelismo 1 (a
primeira configuração mínima da OWASP). São também os padrões da biblioteca,
mas ficam explícitos em `PARAMETROS_ARGON2` para não mudarem com uma
atualização. O banco recusa qualquer `hash_senha` que não comece com
`$argon2id$`.

- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://github.com/napi-rs/node-rs/tree/main/packages/argon2
- https://github.com/ranisalt/node-argon2

### Senha

- Mínimo de 10 e máximo de 128 caracteres (contados como grafemas, então
  acento conta como um).
- Lista local de senhas vazadas: as 9.124 senhas com 10 caracteres ou mais
  de `Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt` do
  SecLists (licença MIT, cópia da licença ao lado do arquivo), em minúsculas.
  A conferência não chama serviço externo. Arquivo baixado em 2026-10-22,
  SHA-256 do original
  `c2e5696882c603b76bb67a47ee970897e5a76fc4c3f5547abe3d0ca340c576e0`.
  https://github.com/danielmiessler/SecLists
- NIST SP 800-63B pede a conferência contra listas de senhas comprometidas,
  sem regras de composição: https://pages.nist.gov/800-63-4/sp800-63b.html

### Sessão

- Id aleatório de 256 bits (`randomBytes(32)`, base64url) no cookie; no banco
  fica só o SHA-256 em hexadecimal (`sessoes.hash_id`). Um vazamento da
  tabela não dá sessão a ninguém. Não há JWT.
- Expiração por inatividade e por idade máxima: painel 12 h e 30 dias; admin
  30 min e 8 h; admin entre a senha e o segundo fator, 5 min e 10 min. A
  política está no domínio (`identidade/sessao.ts`) e usa o relógio do caso
  de uso, para os testes controlarem o tempo.
- O último uso é renovado no máximo uma vez por minuto, para não gravar a
  cada requisição.
- Sair revoga a sessão do cookie. Redefinir a senha revoga todas as sessões
  do usuário, na mesma transação que consome o token. Concluir o cadastro do
  segundo fator revoga todas as sessões do admin.
- Depois do segundo fator, a sessão parcial é revogada e outra é criada, com
  id novo: a sessão que atravessa a mudança de privilégio nunca é a mesma
  (fixação de sessão).

### Cookies

| Cookie                 | App     | Atributos                                                                               |
| ---------------------- | ------- | --------------------------------------------------------------------------------------- |
| `__Host-sessao_painel` | painel  | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain`, `Expires` na idade máxima |
| `__Host-sessao_admin`  | admin   | Os mesmos                                                                               |
| `__Host-csrf`          | os dois | Os mesmos, sem `Expires` (cookie de sessão do navegador)                                |

O prefixo `__Host-` obriga `Secure`, `Path=/` e ausência de `Domain`: o
navegador só aceita o cookie vindo do próprio host, então nenhum subdomínio
grava nem sobrescreve a sessão de outro (cookie tossing).
https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes

Cookies assinados (`@fastify/cookie` com `secret`) não foram usados: o id da
sessão já é aleatório e só vale se o resumo existir no banco, e o segredo do
CSRF é conferido pelo token. Assinar não acrescentaria proteção e criaria um
segredo a mais para girar.

A API confere o host em cada grupo de rotas: as do painel só respondem em
`DOMINIO_PAINEL`, as do admin só em `DOMINIO_ADMIN` (as outras viram 404).
Assim o cookie do admin nunca é emitido para o host do painel, nem por
engano de configuração do proxy. O ADR 0003 descreve o proxy reverso.

### CSRF: @fastify/csrf-protection com cookie

Token sincronizado com segredo em cookie (`__Host-csrf`), enviado pelo app no
cabeçalho `x-csrf-token`, lido por `getToken` (como recomenda o README da
biblioteca e a OWASP para chamadas de API). Toda rota de escrita exige o
token, inclusive login, criação de conta e redefinição (CSRF de login). O app
pede o token em `GET /api/v1/csrf` e, se a API responder
`HTTP_CSRF_INVALIDO`, renova e repete uma vez (`criarClienteDaApi`).

- https://github.com/fastify/csrf-protection
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

Não foi usado `getUserInfo` (ligar o token à sessão): no login ainda não há
sessão, e o prefixo `__Host-` já impede que outro subdomínio plante o segredo.

### Login: mesma resposta e bloqueio progressivo

- E-mail inexistente, e-mail malformado e senha errada dão a mesma resposta
  (401, `SESSAO_ENTRAR_CREDENCIAIS_INVALIDAS`) e o mesmo trabalho: sem
  usuário, o cofre confere a senha contra um hash fictício do mesmo custo.
- Falhas contadas em `tentativas_login` por alvo (resumo SHA-256 de
  `email:<email>` ou `ip:<ip>`; o banco não guarda e-mail nem IP puro aqui).
- Política no domínio (`identidade/bloqueio.ts`): e-mail com 5 falhas livres,
  IP com 20 (redes compartilhadas), segundo fator com 5 por admin. Depois,
  espera de 1 min que dobra a cada falha, até 60 min. Falhas mais velhas que
  24 h são esquecidas. Login certo zera o contador do e-mail, não o do IP.
- Bloqueado responde 429 com `Retry-After`. O e-mail inexistente também é
  bloqueado, para o bloqueio não revelar quais e-mails têm conta.
- Limite de taxa por IP no Redis (`@fastify/rate-limit`, prefixo
  `limite:api:`): entrar 20 por minuto, criar conta 10 por hora, redefinição
  5 por 15 min, segundo fator 10 por minuto. Com o Redis fora, o limite é
  pulado (`skipOnError`) e o erro de conexão vai ao Sentry; o bloqueio no
  banco continua valendo. https://github.com/fastify/fastify-rate-limit
- O IP vem de `request.ip`. Atrás do proxy, `PROXIES_CONFIAVEIS` lista os
  endereços do proxy para o Fastify ler o `X-Forwarded-For`
  (https://fastify.dev/docs/latest/Reference/Server/#trustproxy).

### Redefinição de senha

Token de 256 bits, uso único, 30 minutos, guardado como resumo. Um pedido
novo invalida os anteriores. O link vai no fragmento
(`/redefinir-senha#<token>`), que o navegador não envia ao servidor nem
grava em logs de acesso. A resposta do pedido é sempre 202, exista o e-mail ou
não.

### E-mail

Porta `EnviadorDeEmail`. Adaptadores: console (só com `APP_ENV=local`, escreve
direto no stdout para não passar pelo logger, que ocultaria o link), teste (em
memória) e indisponível (fora do local: falha com
`ErroDependenciaExterna EMAIL_ENVIAR_FALHOU`, que vai ao Sentry). O provedor
real fica para um módulo futuro.

### Admin: identidade própria e segundo fator obrigatório

**Divergência do plano:** a seção 3 do plano descreve `administradores` com
`usuario_id`, ligado a `usuarios`. O M04 criou o admin como identidade
própria, com e-mail, senha e segredo TOTP na tabela `administradores`, sem
`usuario_id`. Motivos: a senha do dono vazada nunca vale no admin; o admin
não precisa de conta no painel; e o cookie, a tabela de tentativas e as
funções privilegiadas ficam separados por público. Se o John preferir o
desenho do plano, a mudança é uma migração de expansão (coluna
`usuario_id` anulável) sem perder nada.

- O primeiro admin nasce por `pnpm admin:criar --email`, com a credencial das
  migrações (é ferramenta de operação, não aplicação): senha temporária
  aleatória de 120 bits, mostrada uma vez, e `troca_de_senha_obrigatoria`.
  O `app_runtime` não consegue criar admin (teste).
- Primeiro acesso: senha temporária, depois o cadastro do TOTP (chave em texto
  e link `otpauth://`, sem QR por ora), confirmação com o primeiro código e
  troca da senha, numa transação, com 10 códigos de recuperação de uso único
  (resumo SHA-256 no banco).
- TOTP: otplib 13, SHA-1, 6 dígitos, 30 s, segredo de 160 bits, tolerância de
  um passo para cada lado (`epochTolerance: 30`). O código usado grava o
  passo; o banco só aceita passo maior que o último (`app.usar_passo_totp`),
  então o mesmo código não vale duas vezes, nem um código mais velho.
  https://github.com/yeojz/otplib, https://otplib.yeojz.dev/guide/security,
  https://datatracker.ietf.org/doc/html/rfc6238
- Segredo TOTP cifrado em repouso com AES-256-GCM (`node:crypto`), IV de 12
  bytes por cifragem, formato `v1.<iv>.<tag>.<cifrado>`. A chave vem de
  `CHAVE_CIFRA_TOTP` (32 bytes em base64), uma por ambiente.
- Trocar a chave invalida os segredos cadastrados. Rotação planejada: um
  formato `v2` com a chave nova e uma rotina que decifra com a antiga e cifra
  com a nova. Fica para quando houver mais de um admin em produção.

### Alertas de pico

Falha de login e de segundo fator é erro de negócio e não gera evento no
Sentry. Para os alertas, a porta `SinaisDeSeguranca`:

- cada falha marca o span da requisição (`autenticacao.falha`,
  `autenticacao.publico`) e grava um log `autenticacao_falhou`, sem e-mail nem
  IP;
- o início de um bloqueio (a falha que atinge o limite livre) gera um aviso no
  Sentry com o código `AUTENTICACAO_SENHA_BLOQUEADA` ou
  `AUTENTICACAO_SEGUNDO_FATOR_BLOQUEADO` e as tags `publico`, `etapa` e
  `alvo` (tipo do alvo, não o valor).

Os alertas estão no runbook `docs/runbooks/sentry-alertas.md` (7 e 8).

### Contratos e cliente

Esquemas `zod` com `strictObject` em `pacotes/contratos`: campo a mais no
corpo é recusado, então `restauranteId` nunca chega por ali. O cliente HTTP
dos apps (`@cardapio/contratos/cliente`) fica num subcaminho próprio, porque
usa `fetch` e os pacotes de domínio não têm os tipos do navegador.

## Consequências

- Variáveis novas na API: `DOMINIO_PAINEL`, `DOMINIO_ADMIN`, `URL_PAINEL`,
  `CHAVE_CIFRA_TOTP` e `PROXIES_CONFIAVEIS`.
- O admin depende de um aplicativo autenticador. Perder o celular e os
  códigos de recuperação exige outro admin para zerar o segundo fator (tela
  no M15).
- Riscos aceitos, registrados no PR do M04:
  - Criar conta com e-mail já usado responde `CONTA_CRIAR_EMAIL_INDISPONIVEL`,
    o que revela que o e-mail tem conta. Mitigação: limite de 10 por hora por
    IP. A correção definitiva é verificar o e-mail antes de ativar a conta.
  - O pedido de redefinição demora um pouco mais quando o e-mail existe,
    porque envia a mensagem. Com o provedor real, o envio deve ir para a fila
    (worker), e a resposta fica igual.
  - Sem Redis, só o bloqueio no banco limita as tentativas.
