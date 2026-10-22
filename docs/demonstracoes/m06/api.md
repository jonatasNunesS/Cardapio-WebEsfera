# M06: cardápio de exemplo pela API, leitura pública e busca sem acento

Data: 2026-10-22. API real (`pnpm --filter @cardapio/api iniciar`) sobre o
Postgres e o Redis do `docker compose`, com as migrações até a 0009. Um
script fez, pelo host `painel.localhost`, o mesmo caminho do dono: criar a
conta, o restaurante, as categorias Entradas e Principais e quatro pratos (a
Burrata como esgotada e a Costela como destaque). Depois leu o cardápio e
buscou pelo host `cardapio.localhost`, sem sessão.

As telas do painel estão em `01-cardapio-no-painel.png` e
`02-conflito-de-versao.png`, capturadas pelo teste ponta a ponta
`scripts/e2e/cardapio.e2e.ts`.

## GET cardapio.localhost/api/v1/cardapios/brasa-e-trigo-570896 (status 200, cache-control: public, max-age=30, stale-while-revalidate=60)

```json
{
  "restaurante": {
    "nome": "Brasa e Trigo 570896",
    "slug": "brasa-e-trigo-570896"
  },
  "personalizacao": {
    "corMarca": "#B4441F",
    "corSobreMarca": "#FFFFFF",
    "corMarcaTexto": "#B4441F",
    "logoUrl": null,
    "capaUrl": null,
    "frase": "",
    "linkAvaliacaoGoogle": null,
    "textos": {
      "boasVindas": "Peça pelo celular quando quiser. Se preferir, chamamos alguém da equipe.",
      "aoChamarGarcom": "Já avisamos a equipe. Alguém vem até a sua mesa.",
      "restauranteFechado": "Estamos fechados agora."
    }
  },
  "aberto": true,
  "proximaAbertura": null,
  "secoes": [
    {
      "id": "01a164a0-0523-7193-8aef-31627d5b09e0",
      "nome": "Entradas",
      "pratos": [
        {
          "id": "01a164a0-0539-7114-8bd1-c696f88b23d0",
          "nome": "Pão de fermentação natural",
          "descricao": "Com manteiga de ervas e flor de sal.",
          "precoCentavos": 2400,
          "preco": "R$ 24,00",
          "disponivel": true,
          "destaque": false
        },
        {
          "id": "01a164a0-0544-7a55-97ad-fc33bd8491c9",
          "nome": "Burrata com tomates",
          "descricao": "Tomates confitados e manjericão.",
          "precoCentavos": 5800,
          "preco": "R$ 58,00",
          "disponivel": false,
          "destaque": false
        }
      ]
    },
    {
      "id": "01a164a0-052d-73da-ba96-c02ea85f106a",
      "nome": "Principais",
      "pratos": [
        {
          "id": "01a164a0-054e-71b0-ace5-8cf6de794693",
          "nome": "Costela na brasa",
          "descricao": "12 horas no fogo de chão, com mandioca crocante e vinagrete.",
          "precoCentavos": 8900,
          "preco": "R$ 89,00",
          "disponivel": true,
          "destaque": true
        },
        {
          "id": "01a164a0-0558-7d04-a213-5bcdabb06180",
          "nome": "Risoto de abóbora assada",
          "descricao": "Queijo canastra e sálvia.",
          "precoCentavos": 6400,
          "preco": "R$ 64,00",
          "disponivel": true,
          "destaque": false
        }
      ]
    }
  ],
  "destaques": ["01a164a0-054e-71b0-ace5-8cf6de794693"],
  "versao": 8
}
```

## busca "abobora" (status 200)

```json
[
  {
    "nome": "Risoto de abóbora assada",
    "categoria": "Principais",
    "preco": "R$ 64,00",
    "disponivel": true
  }
]
```

## busca "COSTELA" (status 200)

```json
[
  {
    "nome": "Costela na brasa",
    "categoria": "Principais",
    "preco": "R$ 89,00",
    "disponivel": true
  }
]
```

## busca "cost" (status 200)

```json
[
  {
    "nome": "Costela na brasa",
    "categoria": "Principais",
    "preco": "R$ 89,00",
    "disponivel": true
  }
]
```

## busca "chao" (status 200)

```json
[
  {
    "nome": "Costela na brasa",
    "categoria": "Principais",
    "preco": "R$ 89,00",
    "disponivel": true
  }
]
```

## busca "entradas" (status 200)

```json
[
  {
    "nome": "Pão de fermentação natural",
    "categoria": "Entradas",
    "preco": "R$ 24,00",
    "disponivel": true
  },
  {
    "nome": "Burrata com tomates",
    "categoria": "Entradas",
    "preco": "R$ 58,00",
    "disponivel": false
  }
]
```

## busca "lagosta" (status 200)

```json
[]
```

## recusas do painel

```json
{
  "precoEmFloat": {
    "status": 400,
    "codigo": "HTTP_ENTRADA_INVALIDA"
  },
  "restauranteIdNoCorpo": {
    "status": 400,
    "codigo": "HTTP_ENTRADA_INVALIDA"
  }
}
```

## slug inexistente

```json
{
  "status": 404,
  "codigo": "CARDAPIO_CONSULTAR_NAO_ENCONTRADO"
}
```
