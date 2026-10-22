# Runbook: administradores da plataforma

Como criar o primeiro admin, o que fazer quando um admin perde o celular e
como trocar a chave que cifra o segredo TOTP. Decisões no ADR 0008.

## Criar um administrador

Roda com a credencial das migrações, nunca com a da API.

1. Com o `.env` do ambiente (ou `URL_BANCO_MIGRACAO` apontando para o banco):

   ```sh
   pnpm admin:criar --email pessoa@webesfera.com.br --nome "Nome" --papel dono_plataforma
   ```

   Papéis: `suporte`, `financeiro` e `dono_plataforma` (padrão).

2. O comando mostra a senha temporária uma vez só. Entregue por um canal
   diferente do e-mail (por exemplo, pessoalmente ou pelo gerenciador de
   senhas da equipe).
3. No primeiro acesso, a pessoa entra com a senha temporária, cadastra o
   aplicativo autenticador, digita o primeiro código, escolhe a senha
   definitiva e guarda os 10 códigos de recuperação.

Se o e-mail já existe, o comando não altera nada.

## Admin perdeu o celular

- Com um código de recuperação: entra normalmente, digitando o código no
  lugar do de 6 dígitos. Cada código vale uma vez.
- Sem códigos: até o M15 não há tela para zerar o segundo fator. Faça pelo
  banco, com a credencial das migrações, e registre na auditoria:

  ```sql
  UPDATE administradores
     SET troca_de_senha_obrigatoria = true,
         segredo_totp_cifrado = NULL,
         segredo_totp_pendente_cifrado = NULL,
         hash_senha = '<hash Argon2id de uma senha temporária nova>'
   WHERE email = 'pessoa@webesfera.com.br';
  UPDATE sessoes SET revogada_em = now()
   WHERE administrador_id = (SELECT id FROM administradores WHERE email = 'pessoa@webesfera.com.br')
     AND revogada_em IS NULL;
  DELETE FROM codigos_recuperacao_admin
   WHERE administrador_id = (SELECT id FROM administradores WHERE email = 'pessoa@webesfera.com.br');
  ```

  A pessoa refaz o primeiro acesso.

## Suspeita de senha de admin vazada

Siga "Admin perdeu o celular" sem apagar o segredo TOTP se o celular está com
a pessoa: troque a senha (`hash_senha` e `troca_de_senha_obrigatoria`) e
revogue as sessões. Depois, leia o alerta 8 do
[runbook do Sentry](sentry-alertas.md).

## Trocar a chave `CHAVE_CIFRA_TOTP`

A chave cifra o segredo TOTP de todos os admins. Trocar a variável sem migrar
os segredos deixa todos sem conseguir entrar (`SEGREDO_DECIFRAR_FALHOU`).

Enquanto não existe a rotação automática (ADR 0008), a troca é:

1. Gerar a chave nova:
   `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`.
2. Zerar o segundo fator de todos os admins (consulta acima, para cada um).
3. Trocar a variável no ambiente e reiniciar a API.
4. Cada admin refaz o primeiro acesso.

Troque a chave se ela vazar ou se alguém com acesso a ela sair da equipe.
