# Runbook: mídia e vídeo do prato

Decisões e motivos no [ADR 0011](../adr/0011-midia-e-video.md). Aqui ficam
os passos.

## Local

```sh
docker compose up -d --wait postgres redis garage
pnpm armazenamento:preparar
```

O script cria `midia-originais` (privado) e `midia-publica` (público, servido
em `http://midia-publica.web.localhost:3902`), dá leitura e escrita à chave
local e aplica o CORS. Rodar de novo não muda nada. O worker precisa de
`ffmpeg`, `ffprobe` e `prlimit` no `PATH`.

## Produção (Cloudflare R2), uma vez por ambiente

1. Criar os buckets `midia-originais` e `midia-publica`.
2. Ligar o domínio próprio (por exemplo `midia.<domínio>`) só no
   `midia-publica`. Não ligar o `r2.dev` em nenhum dos dois.
3. CORS do `midia-originais`: `AllowedOrigins` com a origem do painel,
   `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["content-type"]`,
   `MaxAgeSeconds: 600`.
4. CORS do `midia-publica`: `GET` e `HEAD` de qualquer origem.
5. Token da API do R2 com leitura e escrita de objetos só nesses dois buckets.
6. Variáveis da API e do worker: `URL_ARMAZENAMENTO`
   (`https://<conta>.r2.cloudflarestorage.com`), `REGIAO_ARMAZENAMENTO=auto`,
   `CHAVE_ARMAZENAMENTO`, `SEGREDO_ARMAZENAMENTO`, `BUCKET_ORIGINAIS`,
   `BUCKET_PUBLICO` e `URL_PUBLICA_MIDIA` (o domínio próprio). Deixar
   `URL_ENVIO_ARMAZENAMENTO` vazio.
7. Recomendado: regra de ciclo de vida no `midia-originais` apagando objetos
   com mais de 8 dias (cobre envios abandonados e falha da limpeza).

## Mídia parada em "Processando"

1. No Bull Board, fila `midia`: procurar `processar-midia` pelo
   `restaurante_id`.
2. Sem job: conferir se o evento `MidiaEnviada` saiu da `caixa_saida`
   (`publicado_em`). Se não saiu, o problema é o publicador (runbook de filas).
3. Job com falha: o código do erro diz o caminho.
   - `MIDIA_ARMAZENAMENTO_OPERACAO_FALHOU`: R2 fora ou credencial errada.
     Corrigir e reprocessar o job; a mídia volta sozinha.
   - `MIDIA_PROCESSAR_FERRAMENTA_FALHOU` ou `MIDIA_PROCESSAR_TEMPO_ESGOTADO`: a
     mídia já foi marcada `falhou`; o dono vê "Tentar de novo". O fim do
     stderr do FFmpeg está no evento do Sentry.
4. Na última tentativa a mídia vira `falhou` com `erro_no_processamento`.
   Nunca editar a situação na mão.

## Arquivo que sobrou no armazenamento

A limpeza só apaga mídia com `descartada_em` preenchido. Para conferir um
prefixo `r/{restaurante_id}/midias/{midia_id}/`, ler a linha em `midias`:
descartada e ainda com arquivos, reprocessar o job `descartar-midia` no Bull
Board. Nunca apagar pelo console um prefixo de mídia que está num prato.
