# Runbook: teste manual local

Como subir tudo na sua máquina, semear dados e percorrer o fluxo do piloto à
mão: admin, dono, mesa no celular, fila ao vivo e plano.

## 1. O que roda onde

A API não tem página na raiz: `http://127.0.0.1:3000/` responde 404 de
propósito. Use `/saude/pronto` para conferir que ela está de pé. As telas vêm
dos três apps do Vite, cada um no seu host:

| App      | URL                                                         | Para quê                           |
| -------- | ----------------------------------------------------------- | ---------------------------------- |
| Painel   | `http://painel.localhost:5173`                              | Dono: cardápio, mesas, fila, plano |
| Admin    | `http://admin.localhost:5174`                               | Plataforma: restaurantes, convites |
| Cardápio | `http://cardapio.localhost:5175/<slug>/mesa/<n>?c=<código>` | Cliente na mesa                    |

O host importa: a API confere de qual app veio cada chamada, e as rotas do
admin não existem no host do painel. Chrome e Firefox resolvem `*.localhost`
sozinhos. Se o seu navegador não resolver, ponha no `/etc/hosts`:

```text
127.0.0.1 painel.localhost admin.localhost cardapio.localhost
```

## 2. Subir

```sh
docker compose up -d                 # postgres, redis, garage, migrações, api e worker
pnpm install
pnpm dev                             # painel (5173), admin (5174) e cardápio (5175) juntos
```

Um app só: `pnpm --filter @cardapio/painel dev` (ou `admin`, `cardapio`).

Para o plano (seção 6), em outro terminal:

```sh
HOST_MERCADO_PAGO_FALSO=0.0.0.0 pnpm mp:falso
```

e, no `.env`, `URL_MERCADO_PAGO=http://host.docker.internal:3999`, porque a API
e o worker rodam no Docker. Depois disso, `docker compose up -d api worker`
para eles lerem o `.env` novo.

## 3. Semear

```sh
pnpm semear:local
```

O comando é idempotente: rodar de novo não duplica nada. Ele cria:

- **Admin com segundo fator já cadastrado**: `admin@local.cardapio.dev`, senha
  `senha-local-do-admin`. O código TOTP sai de `pnpm totp:local`. Também dá
  para cadastrar no aplicativo autenticador o segredo
  `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`.
- **Dono com restaurante**: `dono@local.cardapio.dev`, senha
  `senha-local-do-dono`, restaurante `brasa-local`.
- **Cardápio**: a categoria "Da casa", com três pratos.
- **Duas mesas**: 1 e 2. O comando imprime o link local de cada uma.

O script só roda com `APP_ENV=local` e com banco e API em `127.0.0.1` ou
`localhost`; fora disso, ele se recusa. Ele usa o `URL_BANCO_MIGRACAO` do
`.env` e troca o host `postgres` do Docker por `127.0.0.1`. Também usa o
`URL_API_LOCAL` e os domínios do `.env`.

## 4. Celular na rede local

No HTTP da rede local, o cookie da mesa (`__Host-sessao_mesa`, que exige
conexão segura) não é gravado, e o pedido falha. Por isso o celular precisa de
HTTPS:

1. Descubra o IP da máquina na rede (por exemplo `192.168.0.10`).
2. Gere um certificado com o [mkcert](https://github.com/FiloSottile/mkcert):

   ```sh
   mkcert -install
   mkcert -cert-file ~/cert-local.pem -key-file ~/chave-local.pem 192.168.0.10 localhost
   ```

   Para o celular confiar no certificado, instale nele a CA do mkcert (o
   arquivo `rootCA.pem` que `mkcert -CAROOT` mostra). Sem isso, o navegador
   mostra um aviso, e você precisa aceitar.

3. No `.env`, `DOMINIO_CARDAPIO=192.168.0.10`. Depois,
   `docker compose up -d api` e `pnpm semear:local` de novo, para os links das
   mesas saírem com o IP.
4. Suba o cardápio aberto para a rede, em HTTPS:

   ```sh
   HTTPS_LOCAL_CERTIFICADO=~/cert-local.pem HTTPS_LOCAL_CHAVE=~/chave-local.pem \
     pnpm --filter @cardapio/cardapio dev
   ```

5. No celular, abra `https://192.168.0.10:5175/brasa-local/mesa/1?c=<código>`.
   O link que o painel mostra não tem a porta `:5175`; acrescente-a.

Fotos e vídeos de pratos usam `URL_PUBLICA_MIDIA`, que aponta para
`*.localhost`. No celular, as fotos não carregam; o resto do fluxo funciona.

## 5. Roteiro do fluxo completo

Use duas janelas no computador (admin e painel) e o celular, ou uma janela
anônima, como cliente.

1. **Admin cria o restaurante.** Entre em `http://admin.localhost:5174/entrar`
   com o admin semeado e o código de `pnpm totp:local`. Abra **Restaurantes**
   e crie, por exemplo, "Bar Teste", slug `bar-teste`, com o e-mail
   `novo-dono@local.cardapio.dev`.
   - Esperado: o restaurante aparece em `Teste`, com 10 dias, e o link do
     convite aparece uma vez.
2. **Dono aceita o convite.** Abra o link do convite numa janela anônima (é
   `http://painel.localhost:5173/convite#token=...`). Crie a senha, entre com
   o e-mail e essa senha.
   - Esperado: o painel abre no restaurante "Bar Teste".
3. **Dono cadastra prato e mesa.** Em **Cardápio**, crie uma categoria e um
   prato. Em **Mesas e QR Codes**, crie a mesa 1 e copie o link.
4. **Mesa no celular.** Abra o link da mesa como na seção 4, ou no próprio
   computador em `http://cardapio.localhost:5175/...`.
   - Esperado: o cardápio do restaurante.
5. **A fila aberta antes.** No painel, abra **Fila**.
   - Esperado: o topo mostra "Ao vivo".
6. **Pedido.** No celular: escolha um prato, **Adicionar ao pedido**, **Ver
   pedido**, **Enviar pedido**.
   - Esperado na fila, em poucos segundos e sem recarregar: o pedido em
     "Enviados", destacado, e "Novo pedido na fila." no topo. Com
     **Ligar som de alerta** ativo, toca um bipe.
7. **A fila mudando o pedido.** Na fila, **Começar preparo** e depois **Marcar
   pronto**.
   - Esperado no celular, sem recarregar: "Em preparo (agora)" e depois
     "Pronto, a caminho da mesa (agora)".
8. **Chamar o garçom.** No celular: **Chamar garçom ou pedir a conta** e
   **Chamar garçom**.
   - Esperado na fila: um chamado em "Aguardando".
   - Depois de **Assumir**, o celular mostra "Alguém da equipe está vindo
     até a mesa.".
9. **Encerrar a mesa.** Na fila, em **Mesas abertas**, clique em **Encerrar
   mesa 1**.
   - Com pedido ou chamado aberto, o painel pede confirmação: **Encerrar
     mesmo assim**.
   - Esperado no celular: "Obrigado pela visita!". Na tela do pedido ou do
     chamado é na hora; no cardápio, em até 30 s.
10. **Sessão expirada não agradece.** Abra de novo o link antigo da mesa
    depois de encerrar.
    - Esperado: abre uma sessão nova. A tela de agradecimento só aparece
      para quem estava na mesa encerrada.

## 6. Plano com o Mercado Pago falso

Com o falso de pé (seção 2):

1. No painel, abra **Plano e cobrança**, escolha um plano e clique em **Assinar
   pelo Mercado Pago**.
   - O botão leva ao checkout do Mercado Pago de verdade. No falso, **não
     siga o link**: volte ao painel.
2. Autorize a assinatura no falso:

   ```sh
   curl -X POST http://127.0.0.1:3999/__falso/assinaturas              # pegue o id
   curl -X POST http://127.0.0.1:3999/__falso/autorizar/<preapproval_id>
   curl -X POST "http://127.0.0.1:3999/__falso/cobrar/<preapproval_id>?pagamento=approved"
   ```

   - Esperado: em alguns segundos (o aviso passa pelo worker), o plano mostra
     a assinatura autorizada e a cobrança paga.

3. Para ver a recusa, use `pagamento=rejected` no último comando.

Mais detalhes no [runbook de pagamentos](pagamentos.md).

## 7. Quando algo não aparece

- **A fila não recebe nada:** confira se o worker está de pé
  (`docker compose ps`). É ele quem publica a outbox no Redis. Os logs do
  publicador ocioso agora ficam em `debug` e não aparecem no nível `info`.
- **"Reconectando" sem parar:** a API caiu ou o Redis não responde. Quando
  ela voltar, a fila reconsulta sozinha.
- **O pedido falha no celular com "sessão acabou":** o cookie da mesa não foi
  gravado. Abra pelo HTTPS da seção 4, não pelo HTTP.
