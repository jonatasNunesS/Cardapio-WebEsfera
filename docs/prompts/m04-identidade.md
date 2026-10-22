# M04: Identidade, restaurantes e personalização

## Contexto

M00 a M03 aceitos: monorepo, observabilidade, banco isolado com `comRestaurante()`, funções privilegiadas em lista fechada e design system. Ainda não há usuários, login nem tela de negócio.
Antes de tudo, atualize `docs/plano.md`: na seção 7 (linha Runtime) e na seção 12, troque a migração para o Node 26 por "Node 24 LTS mantido; reavaliar no primeiro trimestre de 2028", igual ao ADR 0001.
Leia antes: CLAUDE.md; ADRs 0002, 0005, 0006 e 0007; no plano, a seção 1 (regra 6, cor da marca), a seção 3 (tabelas `usuarios`, `vinculos`, `administradores`, `personalizacoes`, `horarios`) e a seção 5 (autenticação e autorização); e as telas `Personalizacao.dc.html` e `Admin*.dc.html` do protótipo.

## Objetivo

Contas, login do dono, segundo fator do admin, sessões seguras e o cadastro do restaurante com a personalização validada no servidor. Ao fim, um dono cria a conta, cria o restaurante em teste de 10 dias, entra no painel e publica a cor da marca, e um admin entra com dois fatores.

## Escopo

Dentro:

* Domínio: `Usuario`, `Restaurante` (situação, teste, slug), `CorDaMarca` (contraste), `Personalizacao`, `Horario`.
* Casos de uso: `CriarConta`, `Entrar`, `Sair`, `RenovarSessao`, `RedefinirSenha` (pedido e confirmação), `CriarRestaurante`, `PublicarPersonalizacao`, `DefinirHorarios`, `EntrarComoAdmin` (senha e TOTP), `CadastrarSegundoFatorAdmin`.
* Tabelas e migrações: `usuarios`, `vinculos`, `administradores`, `sessoes`, `tentativas_login`, `personalizacoes`, `horarios`, e as funções privilegiadas de login.
* API: rotas de conta, sessão, restaurante e personalização.
* Painel: telas de criar conta, entrar, criar restaurante e Personalização (sem a prévia ao vivo, que é do M14), com componentes do `ui`.
* Admin: tela de login com segundo fator.
* E-mail atrás de uma porta, com adaptador de console em local e de teste.

Fora: perfis da equipe e PIN (V1.1); cobrança (M10); prévia ao vivo (M14); upload real de logo e capa (M07; aqui só o campo de URL interna, preenchido depois); telas do admin além do login (M15).

## Antes de codar

Confira na documentação oficial e cite as URLs no PR:

1. Argon2id em Node: comparar `@node-rs/argon2` e `argon2` (manutenção, binários pré-compilados para a imagem Docker, parâmetros recomendados pela OWASP).
2. TOTP: uma biblioteca mantida (por exemplo `otplib`), com janela de tolerância e proteção contra reuso do mesmo código.
3. Fastify: `@fastify/cookie` (cookies assinados), `@fastify/csrf-protection` ou alternativa, e `@fastify/rate-limit` com Redis.
4. Envio de e-mail: deixe só a porta e os adaptadores de console e de teste. O provedor real é decidido antes do piloto.

## Decisões já tomadas

* Sessão do painel e do admin: id aleatório de 256 bits em cookie `HttpOnly`, `Secure`, `SameSite=Lax`, guardado no banco como hash (nunca o id puro). Expira por inatividade (painel 12 h, admin 30 min) e por idade máxima (painel 30 dias, admin 8 h). Sessão revogável.
* Cookie do admin só no host do admin (sem `Domain`), com prefixo `__Host-`. O do painel também com `__Host-`, se o host do painel e o da API forem o mesmo; se não forem, registre no ADR 0003 como ficou.
* Senha: mínimo 10 caracteres, checagem contra lista de senhas vazadas comuns (lista local, sem chamar serviço externo) e Argon2id.
* Login: mesma resposta e mesmo tempo para e-mail inexistente e senha errada. Bloqueio progressivo por e-mail e por IP em `tentativas_login`, mais limite de taxa no Redis.
* Redefinição de senha: token de uso único, 30 minutos, guardado como hash, sem revelar se o e-mail existe. Ao redefinir, todas as sessões do usuário caem.
* Segundo fator: obrigatório para todo administrador. Segredo TOTP criptografado em repouso (chave em variável de ambiente), códigos de recuperação de uso único, e o mesmo código não vale duas vezes.
* Slug: gerado do nome no cadastro, único, imutável pelo dono (só a WebEsfera troca, no M15, com histórico). Lista de slugs reservados (admin, api, painel, www, mesa, saude e similares).
* Cor da marca: `CorDaMarca` no domínio calcula `cor_sobre_marca` (branco ou escuro, o que der mais contraste) e `cor_marca_texto` (a própria cor se tiver 4,5:1 no fundo, senão o texto padrão). Só publica com 4,5:1 no texto do botão e 3:1 contra o fundo. Quando reprova, devolve a sugestão mais próxima que passa, como no protótipo. Use os mesmos vetores de teste do teste de contraste do `ui`, num arquivo de casos compartilhado em `contratos`, para garantir que o servidor e a tela concordem.
* Link do Google: só `https` em `google.com`, `g.page` ou `goo.gl` e subdomínios; qualquer outro valor é recusado.
* Todo `restaurante_id` vem da sessão. A rota nunca recebe o id do restaurante no corpo nem na URL.

## Funções privilegiadas novas (ADR 0006)

* `app.buscar_credenciais(email)`: devolve `usuario_id`, hash da senha e situação, para o login antes de haver sessão.
* `app.listar_vinculos(usuario_id)`: devolve os restaurantes e papéis do usuário.
* `app.buscar_sessao(hash_id)`: devolve usuário, restaurante ativo e validade.
* `app.buscar_admin(email)`: credenciais do admin. Todas na lista `banco/funcoes-privilegiadas.ts`, executáveis só pelo `app_runtime`, devolvendo o mínimo. Tabelas sem `restaurante_id` (`usuarios`, `administradores`, `sessoes`, `tentativas_login`) não são acessíveis diretamente pelo `app_runtime`: só pelas funções. Justifique cada uma no ADR 0006.

## Erros e Sentry

* Credencial inválida, conta bloqueada, cor sem contraste e slug ocupado são `ErroDeNegocio` (sem Sentry), com códigos no padrão `MODULO_ACAO_MOTIVO`.
* Falha do e-mail é `ErroDependenciaExterna`.
* Picos de login com falha e de segundo fator errado geram alerta (pelo runbook do M01).
* Nada de e-mail, senha, token, código TOTP ou segredo no log ou no Sentry. Acrescente testes de limpeza para esses campos.

## Testes obrigatórios

* `CorDaMarca`: os vetores compartilhados; aprova e reprova como o protótipo (terracota passa, mostarda reprova e sugere tom); a sugestão sempre passa.
* `PublicarPersonalizacao` recusa cor sem contraste mesmo que o front envie, e recusa link que não é do Google.
* Login: mesma resposta para e-mail inexistente e senha errada; bloqueio após N tentativas; desbloqueio após o tempo; limite por IP.
* Sessão: o cookie tem as flags certas; o banco guarda só o hash; expira por inatividade e por idade; sair revoga; redefinir senha derruba todas.
* Admin: sem TOTP não entra; código reutilizado é recusado; código de recuperação funciona uma vez; sessão do admin não vale no painel e vice-versa.
* CSRF: rota de escrita sem o token é recusada.
* Isolamento: as tabelas novas com `restaurante_id` passam nos testes 1 a 8 do M02 sem mudar o M02; o `app_runtime` não lê `usuarios` nem `sessoes` diretamente.
* Slug: geração do nome, unicidade, reservados, acentos.
* Telas: fluxo criar conta, criar restaurante e publicar cor no Chromium, com axe; mensagens de erro ligadas aos campos.

## Critério de pronto

* `pnpm verificar` e CI verdes.
* Demonstração no PR: criar conta, criar restaurante, publicar uma cor reprovada e depois a sugerida; entrar no admin com TOTP.
* ADRs 0006 (atualizado) e 0008 (identidade e sessões) escritos.

## Proibido

JWT para sessão; senha ou token em texto puro no banco; segredo TOTP sem criptografia; `restaurante_id` vindo do cliente; acesso direto do `app_runtime` a `usuarios` ou `sessoes`; mensagens de login que revelem se o e-mail existe; emoji.

## Entrega

Branch da sessão, atualizada a partir da main. Commits por assunto. PR com título `feat: identidade, restaurantes e personalização (M04)`, com o que foi criado, URLs consultadas, demonstrações, riscos e sugestões.
