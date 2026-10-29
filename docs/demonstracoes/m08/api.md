# Demonstração do M08: mesas, QR Codes e sessão de mesa

API (porta 3100) rodando localmente, com Postgres e Redis do compose. Roteiro: conta e restaurante criados pela API; três mesas; sessão aberta pelo link; segundo cliente na mesma mesa; link com slug e número antigos; código inexistente; cartão PNG lido de volta com jsQR; ZIP; link antigo depois de gerar novo código. Os códigos aparecem encurtados e o valor do cookie foi ocultado. O cartão da mesa 12 está em `cartao-mesa-12.png`.

POST /api/v1/mesas número 1: status 201

POST /api/v1/mesas número 2: status 201

POST /api/v1/mesas número 12: status 201

### GET /api/v1/mesas (códigos encurtados)

```json
{
  "slug": "brasa-e-trigo-demo",
  "limite": 30,
  "mesas": [
    {
      "id": "01a18803-8e86-7348-9a08-69f53effd252",
      "numero": 1,
      "nome": null,
      "area": null,
      "ativa": true,
      "link": "https://cardapio.localhost/brasa-e-trigo-demo/mesa/1?c=XKjq..."
    },
    {
      "id": "01a18803-8e92-7646-9e3f-3afd475f7ca1",
      "numero": 2,
      "nome": null,
      "area": null,
      "ativa": true,
      "link": "https://cardapio.localhost/brasa-e-trigo-demo/mesa/2?c=Gxqs..."
    },
    {
      "id": "01a18803-8e9e-785d-a9dd-190eaeafe657",
      "numero": 12,
      "nome": "Varanda",
      "area": null,
      "ativa": true,
      "link": "https://cardapio.localhost/brasa-e-trigo-demo/mesa/12?c=2j_4..."
    }
  ]
}
```

### GET link da mesa 12 (abre a sessão)

```json
{
  "status": 200,
  "corpo": {
    "slug": "brasa-e-trigo-demo",
    "numero": 12,
    "expiraEm": "2026-10-29T18:14:56.944Z"
  },
  "setCookie": "__Host-sessao_mesa=<id>.<hmac>; Path=/; Expires=Thu, 29 Oct 2026 18:14:56 GMT; HttpOnly; Secure; SameSite=Lax"
}
```

### segundo cliente na mesma mesa (reaproveita, mesma validade)

```json
{
  "status": 200,
  "expiraEm": "2026-10-29T18:14:56.944Z"
}
```

### link com slug e número antigos

```json
{
  "status": 301,
  "location": "/api/v1/cardapios/brasa-e-trigo-demo/mesa/12?c=2j_4..."
}
```

### código inexistente

```json
{
  "status": 404,
  "corpo": {
    "type": "urn:cardapio-webesfera:problema:MESA_ABRIR_QR_INVALIDO",
    "title": "Regra de negócio não atendida",
    "status": 404,
    "detail": "Este QR Code não vale mais. Peça ajuda ao garçom.",
    "codigo": "MESA_ABRIR_QR_INVALIDO",
    "id_rastreio": "01a18803-8ec5-7547-863b-18937820d4e8"
  }
}
```

### GET qr.png da mesa 12 lido de volta com jsQR

```json
{
  "status": 200,
  "tipo": "image/png",
  "bytes": 38236,
  "igualAoLink": true
}
```

### GET qr.zip

```json
{
  "status": 200,
  "tipo": "application/zip",
  "disposicao": "attachment; filename=\"mesas-brasa-e-trigo-demo.zip\"",
  "bytes": 108797,
  "arquivos": ["mesa-1.png", "mesa-2.png", "mesa-12.png"]
}
```

### link antigo depois de gerar novo código

```json
{
  "status": 404,
  "codigo": "MESA_ABRIR_QR_INVALIDO"
}
```
