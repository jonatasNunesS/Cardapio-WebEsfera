# ADR 0011: Mídia e vídeo do prato

- Situação: proposta (M07)
- Data: 2026-10-29

## Contexto

O M07 entrega a foto e o vídeo do prato: o dono envia pelo painel, o worker
processa e o cardápio público traz vídeo leve (até cerca de 600 KB), mudo, em
loop e com capa. As regras do prompt (`docs/prompts/m07-midia.md`) valem como
requisito.

Decisões do John antes de codar (2026-10-23):

- Provedor: Cloudflare R2 em produção e Garage como emulador S3 no compose e
  nos testes, com o mesmo adaptador. Critério: o menor custo possível.
- Limite do original: 100 MB e 60 s de vídeo.
- Uma mídia por prato, em `pratos.midia_id`. Galeria fica para depois.
- O original é apagado 7 dias depois de a mídia ficar pronta.
- `sharp` para imagem; FFmpeg só para vídeo.
- Dois buckets, tamanho travado na assinatura, URL de envio de 10 minutos e
  CORS restrito.

| Componente                    | Versão                                                |
| ----------------------------- | ----------------------------------------------------- |
| Garage (compose e CI)         | 2.4.1 (`dxflrs/garage:v2.4.1`)                        |
| @aws-sdk/client-s3            | 3.1148.0                                              |
| @aws-sdk/s3-request-presigner | 3.1148.0                                              |
| sharp                         | 0.35.5 (libvips 8.18.7, libaom 3.15.1, libwebp 1.6.0) |
| FFmpeg (CI e desenvolvimento) | 6.1.1 (Ubuntu 24.04)                                  |
| FFmpeg (imagem do worker)     | pacote `ffmpeg` do Alpine 3.23                        |
| prlimit                       | util-linux (`util-linux-misc` no Alpine)              |

O `sharp` traz o libvips pronto (pacote `@img/sharp-*` da plataforma); não
precisou de script de instalação, e `allowBuilds` não mudou.

## Decisões

### Provedor e custo

Preço do R2 na página oficial (consulta em 2026-10-23):

| Item                      | Preço                | Gratuito por mês |
| ------------------------- | -------------------- | ---------------- |
| Armazenamento             | US$ 0,015 por GB-mês | 10 GB-mês        |
| Classe A (gravar, listar) | US$ 4,50 por milhão  | 1 milhão         |
| Classe B (ler)            | US$ 0,36 por milhão  | 10 milhões       |
| Saída de dados (egress)   | grátis               | ilimitada        |

Conta para o piloto: 5 restaurantes com 60 pratos, cada prato com cerca de
1,5 MB de derivados (MP4, WebM, capa e oito imagens), dão menos de 0,5 GB. O
original some em 7 dias. Leituras do cardápio vão ao CDN da Cloudflare pelo
domínio próprio. Tudo cabe na faixa gratuita; com 500 restaurantes, o
armazenamento fica perto de 45 GB, cerca de US$ 0,53 por mês. Saída grátis é o
que decide para vídeo em loop: o custo não cresce com as visualizações.

O MinIO ficou de fora: o repositório comunitário anuncia que não é mais
mantido. O Garage é mantido, roda num nó só e implementa o que o módulo usa
(assinatura v4, URL assinada, CORS e `DeleteObjects`).

### Dois buckets: originais privados, derivados públicos

No R2 o acesso público é ligado no bucket inteiro (domínio próprio ou
`r2.dev`), não por pasta. Por isso:

- `midia-originais`: privado, só recebe o PUT assinado e é lido pelo worker.
- `midia-publica`: servido pelo domínio próprio; só recebe derivados, gravados
  pelo worker com `Cache-Control: public, max-age=31536000, immutable`.

Os caminhos começam pelo restaurante nos dois buckets:
`r/{restaurante_id}/midias/{midia_id}/original` e
`r/{restaurante_id}/midias/{midia_id}/video.mp4` (e `video.webm`, `capa.jpg`,
`imagem-{largura}.{avif|webp}`). O domínio recusa identificador fora do padrão
UUID, e o banco recusa `caminho_original` que não comece pelo restaurante e pela
mídia da própria linha (`CHECK`). Cada mídia nova tem id novo, então a URL
pública muda a cada troca e o cache longo não serve conteúdo velho.

### Envio direto do navegador

1. O painel pede `POST /api/v1/cardapio/pratos/:id/midias` com tipo e tamanho.
2. A API valida no domínio (tipos aceitos, de 1 byte a 100 MB), grava a mídia
   `enviando` e devolve uma URL de PUT assinada por 10 minutos.
3. O navegador envia o arquivo direto ao bucket. A API nunca recebe o arquivo.
4. O painel chama `POST /api/v1/cardapio/midias/:id/confirmacao`. A API faz um
   `HEAD` (fora de transação) e confere tamanho e tipo; então muda a mídia para
   `processando` e grava `MidiaEnviada` na outbox, na mesma transação.

A assinatura cobre `content-type` e `content-length`: o armazenamento recusa
corpo de outro tamanho, outro tipo, outro caminho e URL vencida. Conferido no
Garage (403 e 400) e coberto por teste. Uma URL de PUT vencida volta sem os
cabeçalhos de CORS no R2, então o painel não lê o motivo: qualquer falha no
envio pede uma URL nova uma vez antes de mostrar o erro.

O cliente S3 usa `requestChecksumCalculation: 'WHEN_REQUIRED'`. Com o padrão
das versões recentes do SDK, a URL assinada passa a exigir um checksum que o
navegador não manda, e o envio falha (`InvalidDigest` no Garage).

CORS do bucket privado: só `PUT`, só a origem do painel, só o cabeçalho
`content-type`. O bucket público aceita `GET` e `HEAD` de qualquer origem.
Localmente, o script `pnpm armazenamento:preparar` cria os buckets e aplica as
regras pela API de administração do Garage. Em produção a configuração é feita
uma vez no painel do R2 (ver `docs/runbooks/midia.md`).

### Estados e processamento em transações curtas

Estados: `enviando` (URL emitida), `processando` (confirmada, na fila),
`pronta` e `falhou`. O job `processar-midia` vem do evento `MidiaEnviada`
(jobId `evento-{id}-processar-midia`) e roda assim:

1. Transação curta: marca o início, só se a mídia está `processando` na mesma
   `tentativa` do evento. Caso contrário, o job é ignorado.
2. Fora de transação: baixa o original para uma pasta temporária, sonda,
   processa e envia os derivados.
3. Transação curta: grava os derivados e marca `pronta`. Na mesma transação,
   liga a mídia ao prato e descarta a anterior com `MidiaDescartada` na outbox.
   Se a mídia foi removida no meio, ela não volta ao prato e um novo
   `MidiaDescartada` garante a limpeza dos arquivos recém-enviados.

O envoltório das filas (`JOBS_EM_TRANSACOES_CURTAS`) não abre a transação do
restaurante para os jobs de mídia; cada passo abre a sua, com
`comRestaurante()`. Teste: durante o FFmpeg, nenhuma conexão do worker está
`idle in transaction` nem segura trava em `midias`.

Idempotência: os derivados têm nomes fixos dentro da pasta da mídia, então
repetir o processamento sobrescreve em vez de duplicar, e um job da mesma
tentativa depois de `pronta` é ignorado. "Tentar de novo" só vale para
`falhou`; ele soma 1 em `tentativa` e grava um evento novo.

### Validação do arquivo no servidor

- Vídeo: `ffprobe` lê o conteúdo, não a extensão (`format_name`, faixas e
  duração). Aceita contêiner MP4/MOV ou WebM/Matroska com uma faixa de vídeo
  que não seja capa embutida. Só áudio vira `sem_video`; acima de 60 s vira
  `longo_demais`; entre 10 e 60 s é cortado.
- Foto: `sharp` lê os metadados com `failOn: 'error'` e limite de 64
  megapixels; aceita JPEG, PNG e WebP e respeita a orientação EXIF.
- Lado entre 16 e 8000 pixels.
- Derivado acima de 600 KB depois da segunda tentativa de codificação vira
  `derivado_grande_demais`.
- Recusa é falha de negócio: grava `falhou` com o motivo, não repete o job e não
  toca no prato.

### Parâmetros do FFmpeg

Entrada lida só até o limite (`-t` antes de `-i`), com
`-protocol_whitelist file`, `-map 0:v:0`, `-an -sn -dn` e `-map_metadata -1`.

| Saída        | Parâmetros                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Filtro       | `fps=30,scale=-2:'min(720,ih)':flags=lanczos` (no máximo 720p, sem aumentar)                         |
| `video.mp4`  | `libx264 -preset medium -profile:v high -pix_fmt yuv420p -movflags +faststart`                       |
| `video.webm` | `libvpx-vp9 -pix_fmt yuv420p -deadline good -cpu-used 4 -row-mt 1`                                   |
| Taxa         | `-b:v` = min(400 kbps, 85% de 600 KB dividido pela duração); `-maxrate` 1,1x; `-bufsize` 2x          |
| Repetição    | Passou de 600 KB: codifica de novo com 60% da taxa                                                   |
| `capa.jpg`   | quadro em min(1 s, metade da duração), mesma escala, `-q:v 4`                                        |
| Imagens      | `sharp`: AVIF qualidade 50 (esforço 4) e WebP qualidade 72 em 320, 640, 960 e 1280 px (as que cabem) |

Medido com ruído intenso em 1080p, o pior caso para o codificador: MP4 com
424 KB, WebM com 586 KB e capa com 227 KB. Com o vídeo de teste dos testes,
todos ficam bem abaixo.

### Isolamento do FFmpeg

- Processo filho com ambiente mínimo (`PATH` e `LANG`), sem entrada padrão.
- `prlimit` limita memória virtual (padrão 1,5 GB), tempo de CPU e arquivos
  abertos. Um limite de memória baixo demais faz o FFmpeg falhar com erro
  definitivo (teste), sem derrubar o worker.
- Tempo de parede: 120 s por execução (o plano pede 2 min por arquivo).
  Passou, o processo leva `SIGKILL` e o erro é definitivo.
- Rede: o FFmpeg só abre arquivos locais (`-protocol_whitelist file`); quem fala
  com o armazenamento é o worker, antes e depois.
- Erro definitivo (ferramenta falhou ou tempo esgotado) não repete, vai uma vez
  ao Sentry com o fim do stderr e marca a mídia `falhou`. Erro do armazenamento
  repete (5 tentativas da fila `midia`); na última, a mídia também vira `falhou`
  (gancho `aoEsgotarTentativas`).

Contêiner próprio por arquivo, sem rede, ficou como sugestão: hoje o isolamento
é de processo, e o contêiner do worker tem os próprios limites de CPU e memória
na hospedagem.

### Limpeza

- Trocar ou remover descarta a mídia (`descartada_em`) e grava
  `MidiaDescartada` na outbox. O job `descartar-midia` apaga o prefixo da mídia
  nos dois buckets (listar e `DeleteObjects` em lotes de 1000). Ele só apaga
  mídia marcada como descartada, nunca a que está no prato.
- `apagar-original-midia` é enfileirado com atraso de 7 dias quando a mídia fica
  pronta (jobId `apagar-original-{midia}`). Apaga só o original e marca
  `original_apagado_em`. Nada é apagado na requisição.

### Cardápio público

Cada prato traz `midia: { tipo, imagem: { src, avif, webp, largura, altura },
video: { capa, mp4, webm, duracaoMs } | null } | null`. Só entra a mídia
`pronta` ligada ao prato. Enquanto a nova processa ou se ela falha, o prato
continua com a anterior. Trocar a mídia do prato sobe a versão do cardápio
pelo gatilho do M06.

### Banco

Tabela `midias` (migração `0010_midias.sql`) com RLS forçado, fábrica de teste
e `SELECT, INSERT, UPDATE` para `app_runtime` (sem `DELETE`). Diferença do
plano: em vez de `caminho_mp4` e `caminho_capa`, os derivados ficam num
`jsonb` (caminho e bytes de cada arquivo e as variantes de imagem), porque a
foto tem oito arquivos e o vídeo, treze. A chave estrangeira de
`pratos.midia_id` aponta para `midias` pelo par restaurante e id.

## Consequências

- Reprocessar com parâmetros novos depois de 7 dias exige novo envio: o
  original não existe mais. Um "tentar de novo" depois disso é recusado, e o
  dono envia o arquivo de novo.
- Mídia em `enviando` que nunca foi confirmada deixa o original no bucket
  privado. Sugestão: regra de ciclo de vida no R2 para apagar originais com mais
  de 8 dias, o que também cobre falhas da limpeza.
- O job atrasado de 7 dias vive no Redis (com `appendonly` e `noeviction`). Se
  o Redis perder os dados, o original fica até a regra de ciclo de vida.
- O processamento de vídeo usa CPU do worker: cerca de 10 s para o MP4 e 30 s
  para o WebM de um vídeo 1080p de 10 s, com 2 threads. A fila `midia` roda
  núcleos menos 1 em paralelo.
- A porta pede "mover"; o desenho não precisou: o original fica onde chegou e
  os derivados são gravados direto no bucket público. Sem uso, não há método.

## Fontes consultadas

O proxy deste ambiente bloqueia ffmpeg.org; li o fonte oficial da documentação
no repositório do projeto (o mesmo texto das páginas).

- https://developers.cloudflare.com/r2/pricing/ (fonte:
  https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/r2/pricing.mdx)
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/: operação, validade
  de 1 s a 7 dias.
- https://developers.cloudflare.com/r2/buckets/cors/: CORS do PUT assinado e
  URL vencida sem cabeçalhos de CORS.
- https://developers.cloudflare.com/r2/buckets/public-buckets/: acesso público
  por bucket, com domínio próprio.
- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
- https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html:
  `requestChecksumCalculation`.
- https://garagehq.deuxfleurs.fr/documentation/quick-start/ (fonte:
  https://github.com/deuxfleurs-org/garage/blob/main-v2/doc/book/quick-start/_index.md)
- https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/
- https://garagehq.deuxfleurs.fr/api/garage-admin-v2.json
- https://github.com/minio/minio (aviso de repositório sem manutenção)
- https://ffmpeg.org/ffmpeg.html (fonte:
  https://github.com/FFmpeg/FFmpeg/blob/master/doc/ffmpeg.texi): `-t`, `-an`,
  `-map_metadata`, `-frames`.
- https://ffmpeg.org/ffmpeg-codecs.html (fonte:
  https://github.com/FFmpeg/FFmpeg/blob/master/doc/encoders.texi): libx264
  (`preset`, `profile`, `maxrate`, `bufsize`) e libvpx (`deadline`,
  `cpu-used`, `row-mt`).
- https://ffmpeg.org/ffmpeg-protocols.html (`protocol_whitelist`).
- https://ffmpeg.org/ffprobe.html (fonte:
  https://github.com/FFmpeg/FFmpeg/blob/master/doc/ffprobe.texi):
  `-print_format json`, `-show_format`, `-show_streams`.
- https://sharp.pixelplumbing.com/api-constructor (`limitInputPixels`,
  `failOn`), https://sharp.pixelplumbing.com/api-output (`avif`, `webp`) e
  https://sharp.pixelplumbing.com/api-input (`metadata`, `orientation`).
- https://man7.org/linux/man-pages/man1/prlimit.1.html
- https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
  (`timeout`, `killSignal`).
