# Segredos a configurar antes do piloto

Cada segredo é gerado por ambiente, guardado no cofre de segredos e nunca
entra no repositório nem no `.env.exemplo` com valor real. Os valores do
`.env.exemplo`, do CI e dos testes são só locais.

| Variável                                       | Onde                  | Como gerar e trocar                                                                                                |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CHAVE_SESSAO_MESA`                            | API                   | 32 bytes aleatórios em base64url. Trocar encerra as sessões de mesa abertas. [ADR 0012](../adr/0012-mesas-e-qr.md) |
| `CHAVE_CIFRA_TOTP`                             | API                   | 32 bytes em base64. Trocar exige migrar os segredos TOTP. [Runbook do admin](admin.md)                             |
| Senhas dos papéis do banco                     | API, worker, migração | Três senhas fortes, uma por papel. [Runbook do banco](banco.md)                                                    |
| `CHAVE_ARMAZENAMENTO`, `SEGREDO_ARMAZENAMENTO` | API, worker           | Token de API do R2 com acesso só aos dois buckets. [Runbook de mídia](midia.md)                                    |
| `SENTRY_DSN_BACKEND`, `SENTRY_DSN_FRONTEND`    | API, worker, apps     | Do projeto no Sentry. `SENTRY_AUTH_TOKEN` fica só nos segredos do CI. [Runbook do Sentry](sentry-alertas.md)       |

Gerar uma chave aleatória:

```sh
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```
