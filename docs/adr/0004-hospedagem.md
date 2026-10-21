# ADR 0004: Hospedagem

- Situação: proposta. A decisão é do John.
- Data da consulta de preços: 2026-10-21

## Contexto

Precisamos hospedar API, worker, PostgreSQL e Redis gerenciados (seção 10 do
plano), de preferência em São Paulo. A carga inicial é de 3 a 5 restaurantes
piloto. O plano prevê 2 instâncias da API e 1 worker até 20 restaurantes
(seção 9). As três SPAs e a mídia ficam fora daqui: SPAs em CDN, e mídia
decidida no M07 (Bunny ou R2).

As restrições do John (cartão internacional, exigência de dados no Brasil,
conta já existente) não foram informadas. Este ADR supõe que **dados no Brasil
são preferíveis** e que **não há conta prévia**. A forma de pagamento está nos
riscos.

## Premissas do cálculo

- 730 horas por mês, preços sob demanda em USD, sem impostos, sem desconto por
  compromisso e sem tráfego de saída.
- API: 2 instâncias sempre ligadas. Worker: 1 instância sempre ligada (BullMQ
  precisa de processo contínuo).
- PostgreSQL com 20 GiB de SSD; Redis com o menor nó disponível.
- Ficam fora: logs, métricas, cofre de segredos, DNS e WAF (Cloudflare, seção 10) e tráfego de saída.

## Opção A: AWS em São Paulo (sa-east-1)

ECS Fargate (ARM) para API e worker, RDS for PostgreSQL, ElastiCache com
Valkey e um Application Load Balancer.

Fonte: API oficial de preços da AWS (Price List API), arquivos `AmazonECS`,
`AmazonRDS`, `AmazonElastiCache`, `AWSELB` e `AmazonVPC` de `sa-east-1`, em
`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<servico>/current/sa-east-1/index.json`.
Datas de publicação dos arquivos: ECS 2026-10-19; ELB 2026-09-11; VPC
2026-10-16.

| Item                                         | Preço unitário (USD)                | Configuração                            | Mês (USD) |
| -------------------------------------------- | ----------------------------------- | --------------------------------------- | --------- |
| Fargate ARM, vCPU                            | 0,0557 por vCPU-hora                | API 2 x 0,25 vCPU; worker 1 x 0,25 vCPU | 30,50     |
| Fargate ARM, memória                         | 0,00612 por GB-hora                 | 3 x 0,5 GB                              | 6,70      |
| RDS PostgreSQL db.t4g.micro, Single-AZ       | 0,034 por hora                      | 1 instância                             | 24,82     |
| RDS, armazenamento gp3                       | 0,219 por GB-mês                    | 20 GB                                   | 4,38      |
| ElastiCache Valkey cache.t4g.micro (0,5 GiB) | 0,024 por hora                      | 1 nó                                    | 17,52     |
| Application Load Balancer                    | 0,034 por hora + 0,011 por LCU-hora | 1 ALB, cerca de 1 LCU                   | 32,85     |
| IPv4 público                                 | 0,005 por endereço-hora             | cerca de 5 endereços                    | 18,25     |
| **Total aproximado**                         |                                     |                                         | **135**   |

- Alta disponibilidade do banco: db.t4g.micro Multi-AZ custa 0,069 por hora
  (50,37 por mês), contra 24,82 do Single-AZ.
- Backups: o RDS faz backup automático com recuperação para um ponto no
  tempo. O que passar da cota gratuita custa 0,095 por GB-mês.
- Contêiner: imagens OCI no ECR e serviço ECS com troca gradual, o que atende o
  rollback em até 5 minutos da seção 10.
- Redis: Valkey é o fork aberto do Redis. Compatibilidade com o BullMQ a
  confirmar no M05. Redis 7.x no ElastiCache custa 0,030 por hora no
  cache.t4g.micro.

## Opção B: Google Cloud em São Paulo (southamerica-east1)

Cloud Run para API e worker, Cloud SQL for PostgreSQL e Memorystore for Redis.
Não precisa de balanceador: o Cloud Run tem HTTPS próprio, e a Cloudflare fica
na frente.

Fontes, consultadas em 2026-10-21 com a região São Paulo:
https://cloud.google.com/run/pricing, https://cloud.google.com/sql/pricing e
https://cloud.google.com/memorystore/docs/redis/pricing. No Cloud Run, São
Paulo fica no Tier 2.

| Item                                                  | Preço unitário (USD)                                      | Configuração                                      | Mês (USD)      |
| ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | -------------- |
| Cloud Run, CPU (cobrança por instância)               | 0,0000216 por vCPU-segundo                                | API 1 instância + worker 1 instância, 1 vCPU cada | 113,53         |
| Cloud Run, memória                                    | 0,0000024 por GiB-segundo                                 | 2 x 0,5 GiB                                       | 6,31           |
| Nível gratuito do Cloud Run                           | 240.000 vCPU-s e 450.000 GiB-s por mês, a preço do Tier 1 |                                                   | cerca de -5,22 |
| Cloud SQL db-g1-small (núcleo compartilhado, 1,7 GiB) | 38,325 por mês                                            | 1 instância                                       | 38,33          |
| Cloud SQL, SSD                                        | 0,255 por GiB-mês                                         | 20 GiB                                            | 5,10           |
| Memorystore for Redis, Basic M1                       | 63,51 por GiB-mês                                         | 1 GiB                                             | 63,51          |
| **Total aproximado**                                  |                                                           |                                                   | **222**        |

- Com 2 instâncias de API, como na opção A, o total passa de 280.
- Variações: Cloud SQL db-f1-micro custa 11,534 por mês. Alta disponibilidade:
  HA db-g1-small custa 76,65 por mês, e o SSD com HA, 0,51 por GiB-mês.
  Backups usados custam 0,12 por GiB-mês.
- O cálculo usa 1 vCPU por instância. Conferir na documentação do Cloud Run o
  mínimo de CPU com cobrança por instância antes de decidir: é o item que mais
  pesa.
- O Cloud Run encerra requisições longas por tempo limite. O SSE do painel
  (M13) precisa reconectar sozinho, o que o EventSource já faz.

## Opções que não consegui cotar daqui

As páginas oficiais de preço da Fly.io (região GRU, São Paulo), da Magalu
Cloud (empresa brasileira, cobrança em reais) e também da Render e da Railway
(sem região no Brasil, até onde sei) estão bloqueadas pela rede deste ambiente.
Não coloco números sem fonte. Se quiser uma terceira opção, a Magalu Cloud é a
mais interessante para o caso de não usar cartão internacional, e dá para
cotar fora daqui.

## Comparação

| Critério                        | A: AWS sa-east-1                                                          | B: Google Cloud southamerica-east1                  |
| ------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| Custo mensal estimado no piloto | cerca de 135 USD                                                          | cerca de 222 USD (280 com 2 APIs)                   |
| Dados no Brasil                 | Sim                                                                       | Sim                                                 |
| Contêiner                       | ECS Fargate                                                               | Cloud Run                                           |
| Backups do banco                | Automáticos, com recuperação para um ponto no tempo                       | Automáticos, com recuperação para um ponto no tempo |
| Operação                        | Mais peças: VPC, ALB, IAM, ECR. Pede Terraform ou OpenTofu desde o início | Menos peças, sem balanceador                        |
| Redis                           | Valkey a partir de 0,5 GiB                                                | Redis a partir de 1 GiB, com preço mínimo alto      |
| Crescimento                     | Fargate e RDS sobem em degraus pequenos                                   | Cloud Run escala sozinho; o custo base fica fixo    |

## Recomendação

**Opção A, AWS em São Paulo**, com ECS Fargate ARM, RDS PostgreSQL Single-AZ
no piloto (Multi-AZ antes de passar de 20 restaurantes), ElastiCache Valkey e
ALB, tudo descrito em OpenTofu. Ela custa cerca de 40% menos no tamanho do
piloto, tem o menor nó de Redis e se encaixa no "uma instância nova na frente,
rollback em 5 minutos" da seção 10. O custo é a operação: VPC, ALB e IAM
exigem infraestrutura como código desde o primeiro deploy. Sem isso, a opção B
fica melhor.

A decisão é do John, de preferência antes do primeiro ambiente de homologação.

## Riscos e pendências

- **Forma de pagamento:** não conferi se dá para pagar em reais, com nota
  fiscal brasileira, sem cartão internacional, em nenhum dos dois provedores.
  Conferir no cadastro antes de decidir.
- Preços em USD sem impostos. O câmbio e os impostos de serviço do exterior
  mudam o custo final em reais.
- Tráfego de saída e logs não foram estimados. Com a mídia num CDN (M07), o
  tráfego da API deve ser pequeno, mas precisa ser medido no piloto.
