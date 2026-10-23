# M07: Mídia e vídeo do prato
## Contexto
M00 a M06 aceitos. Há cardápio, pratos (com campo de mídia anulável), filas, outbox e o `VideoPrato` no `ui`. Falta processar e entregar o vídeo.
Leia antes: CLAUDE.md; ADRs 0006, 0009 e 0010; no plano, a seção 1 (RF12, vídeo), a seção 3 (tabela `midias`), a seção 5 (upload assinado, FFmpeg isolado) e a seção 7 (vídeo, custos por GB). E a tela `Prato.dc.html`.
## Objetivo
O dono envia uma foto ou um vídeo pelo painel; o worker processa; o cardápio entrega vídeo leve (até ~600 KB), mudo, em loop, com capa. Se o vídeo falhar, o prato fica com a foto. Nada bloqueia a API.
## Regra que atravessa todo o módulo
Transação curta, chamada externa fora da transação:

1. transação curta: ler o job e marcar `processando`;
2. fora de transação: baixar o original, rodar FFmpeg, subir os derivados;
3. transação curta: gravar caminhos e marcar `pronta` (ou `falhou`). Nunca manter transação aberta durante FFmpeg ou chamada ao storage.

## Escopo
Dentro:

- Porta `ArmazenamentoDeMidia` (URL de upload assinada, mover, apagar, URL pública) e o adaptador do provedor escolhido.
- Upload direto do painel para o storage por URL assinada (o arquivo não passa pela API).
- Pipeline FFmpeg no worker (fila `midia`): recorte até 10 s, sem áudio, 720p, MP4 e WebM, capa JPEG, limite de 600 KB por derivado, tamanho e tipo validados.
- Estados da `midia` (enviando, processando, pronta, falhou) e vínculo com o prato; o cardápio público passa a trazer as URLs.
- Imagens AVIF e WebP com `srcset` para a foto do prato.
- Limpeza do original e dos derivados ao trocar ou remover a mídia.
- Telas do painel: enviar, ver processando, trocar, remover.
- ADR 0011.

Fora: geração de vídeo por IA; CDN de produção (só a porta, com um adaptador local no compose); tela do cliente montada (M09).
## Provedor de mídia (decidir no "Antes de codar")
Recomendo Bunny (armazenamento mais CDN), por ser o mais barato por GB para loops curtos, conforme a seção 7. Confirme preço e limites na página oficial hoje. Alternativa: Cloudflare R2. Deixe tudo atrás da porta `ArmazenamentoDeMidia` e, no compose e nos testes, use um adaptador local compatível com S3 (por exemplo um emulador S3 mantido), decidido aqui. Registre a escolha e o custo no ADR 0011. Se o preço ou a manutenção mudarem o quadro, me traga antes de implementar.
## Antes de codar
Confira na documentação oficial e cite as URLs no PR:

1. FFmpeg: recorte, remoção de áudio, escala para 720p, MP4 (H.264) e WebM (VP9 ou AV1), poster, e os limites para ficar perto de 600 KB.
2. O provedor escolhido: URL de upload assinada de curta duração, CORS do upload direto, e a URL pública por domínio próprio.
3. Validação do arquivo no servidor antes de processar (tipo real, não só a extensão; duração; tamanho).
4. Isolamento do FFmpeg: processo com limite de CPU, memória e tempo, sem rede além do storage (seção 5).

## Decisões já tomadas

- O upload vai direto do navegador para o storage por URL assinada que a API gera; a API nunca recebe o arquivo. O caminho leva o `restaurante_id` e o id da mídia (função `chavesRedis` / caminho da seção 3). Originais em área privada; só os derivados finais são públicos.
- Um job de mídia por arquivo, idempotente pela chave (mídia + versão). Se o worker falhar, o prato segue com a foto; o dono vê "falhou" e um botão "tentar de novo".
- Cada mídia pertence a um prato e a um restaurante; toda operação de storage e de banco é isolada por restaurante.
- Ao trocar ou remover a mídia, os arquivos antigos entram numa fila de limpeza; nada de apagar de forma síncrona na requisição.
- O cardápio público passa a trazer `capa`, `mp4`, `webm` e os `srcset` das imagens; sem vídeo pronto, traz só a foto.

## Testes obrigatórios (storage emulado, Postgres e Redis reais)

- URL de upload assinada: válida só para o caminho daquele restaurante e daquela mídia, e expira.
- FFmpeg: um vídeo de teste gera MP4, WebM e capa; cada derivado abaixo de 600 KB; áudio removido; cortado em 10 s.
- Arquivo ruim (áudio só, tipo errado, grande demais, maior que 10 s): é recusado ou cortado, a fila não trava, o prato fica com a foto.
- Idempotência: reprocessar a mesma mídia não duplica derivados.
- Isolamento: a URL assinada de A não serve para o caminho de B; a mídia de A não aparece no cardápio de B.
- A transação não fica aberta durante o FFmpeg (teste que mede ou que força lentidão no passo externo e verifica que o banco não está preso).
- Troca de mídia: o arquivo antigo vai para a limpeza e some do storage.
- Cardápio: com vídeo pronto, traz as URLs; sem, traz a foto.
- Telas no Chromium, com axe: enviar, processando, falhou com "tentar de novo", trocar.

## Critério de pronto
`pnpm verificar` e CI verdes; demonstração no PR com um vídeo real processado (tamanhos dos derivados) e o cardápio trazendo as URLs; ADR 0011 com o provedor, o custo e os parâmetros do FFmpeg.
## Proibido
Arquivo passando pela API; transação aberta durante FFmpeg ou storage; original público; apagar storage de forma síncrona na requisição; mídia sem isolamento por restaurante; emoji.
## Entrega
Branch da sessão, atualizada a partir da main. Commits por assunto. PR `feat: mídia e vídeo do prato (M07)`, com o que foi criado, o provedor e o custo, URLs, demonstração, riscos e sugestões.
