# Demonstração do M07: vídeo real processado

API (porta 3100) e worker rodando localmente, com Postgres, Redis e Garage do compose. Roteiro: conta, restaurante, categoria e dois pratos criados pela API; envio direto ao bucket privado pela URL assinada; confirmação; processamento no worker; leitura do cardápio público.

Entrada: vídeo de 15 s em 1920x1080 a 30 qps, com áudio AAC e ruído (para dificultar a compressão), 8,2 MB, gerado com FFmpeg.

Resultado: cortado em 10 s, sem áudio, 1280x720. MP4 com 487 KB, WebM com 506 KB e capa com 48 KB, todos abaixo de 600 KB. O original não é servido pelo endereço público (404). A assinatura e a credencial foram ocultadas.

### POST /api/v1/cardapio/pratos/:id/midias (status 201)

```json
{
  "midiaId": "01a184fe-4d55-72d1-a970-c5b4e1d626f9",
  "url": "http://127.0.0.1:3900/midia-originais/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/original?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=...&X-Amz-Date=20261029T001020Z&X-Amz-Expires=600&X-Amz-Signature=...&X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost&x-id=PutObject",
  "metodo": "PUT",
  "cabecalhos": {
    "content-type": "video/mp4"
  },
  "expiraEm": "2026-10-29T00:20:20.889Z"
}
```

### envio direto ao armazenamento e confirmação

```json
{
  "putStatus": 200,
  "putComOutroTamanho": "recusado antes do fim do envio (EPIPE)",
  "confirmacao": 204
}
```

### processado em 23 s

```json
{
  "atual": "pronta",
  "pendente": null
}
```

### GET cardapio.localhost/api/v1/cardapios/brasa-e-trigo-620810: pratos

```json
[
  {
    "nome": "Costela na brasa",
    "midia": {
      "tipo": "video",
      "imagem": {
        "largura": 1280,
        "altura": 720,
        "src": "http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-1280.webp",
        "avif": "http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-320.avif 320w, http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-640.avif 640w, http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-960.avif 960w, http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-1280.avif 1280w",
        "webp": "http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-320.webp 320w, http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-640.webp 640w, http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-960.webp 960w, http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/imagem-1280.webp 1280w"
      },
      "video": {
        "capa": "http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/capa.jpg",
        "mp4": "http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/video.mp4",
        "webm": "http://midia-publica.web.localhost:3902/r/01a184fe-4d26-755b-8919-4393636e4af3/midias/01a184fe-4d55-72d1-a970-c5b4e1d626f9/video.webm",
        "duracaoMs": 10000
      }
    }
  },
  {
    "nome": "Risoto de abóbora",
    "midia": null
  }
]
```

### derivados no bucket público (baixados pela URL pública)

```json
{
  "mp4": {
    "status": 200,
    "bytes": 498218,
    "tipo": "video/mp4",
    "cache": "public, max-age=31536000, immutable",
    "ffprobe": ["stream|codec_name=h264|codec_type=video|width=1280|height=720", "format|duration=10.000000"]
  },
  "webm": {
    "status": 200,
    "bytes": 517916,
    "tipo": "video/webm",
    "cache": "public, max-age=31536000, immutable",
    "ffprobe": ["stream|codec_name=vp9|codec_type=video|width=1280|height=720", "format|duration=10.000000"]
  },
  "capa": {
    "status": 200,
    "bytes": 49023,
    "tipo": "image/jpeg",
    "cache": "public, max-age=31536000, immutable"
  },
  "imagem": {
    "status": 200,
    "bytes": 20178,
    "tipo": "image/webp",
    "cache": "public, max-age=31536000, immutable"
  }
}
```

### original pela URL pública do bucket privado

```json
{
  "status": 404
}
```
