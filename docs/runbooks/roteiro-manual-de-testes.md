# Roteiro manual de testes

O que o CI não consegue provar. Rodar antes de cada versão (seção 6 do plano),
em aparelhos reais, e anotar o resultado no PR da versão.

## Como registrar

Para cada item: aparelho, sistema e navegador com versão, data, quem testou,
"passou" ou "falhou" e, se falhou, o que aconteceu e o link do print ou do
vídeo da tela.

## 1. Vídeo do prato em MP4 no Safari do iPhone

O CI roda no Chromium, que toca o WebM. O Safari do iPhone toca o MP4 (H.264),
e esse caminho só se prova no aparelho.

Aparelho: iPhone com o iOS mais recente e um iPhone com o iOS mais antigo que
ainda recebe atualização. Navegador: Safari.

1. Abrir o cardápio de teste pelo QR Code de uma mesa, com um prato em
   destaque que tenha vídeo.
2. Rolar até o vídeo ficar quase todo visível.
   - Esperado: toca sozinho, sem som, em loop e sem abrir em tela cheia.
3. Rolar até o vídeo sair da tela e voltar.
   - Esperado: pausa ao sair e volta a tocar ao reaparecer.
4. Tocar em "Pausar vídeo do prato".
   - Esperado: pausa e não volta a tocar sozinho ao rolar.
5. Com três pratos com vídeo na mesma tela.
   - Esperado: no máximo dois tocando ao mesmo tempo.
6. Ativar Ajustes > Acessibilidade > Movimento > Reduzir Movimento e abrir o
   cardápio de novo.
   - Esperado: o vídeo não toca sozinho; aparecem a capa e "Reproduzir", e o
     toque em "Reproduzir" toca o vídeo.
7. Ativar o Modo Pouco Dados (Ajustes > Celular > Opções de Dados Celulares) e
   abrir o cardápio de novo.
   - Esperado: mesmo comportamento do passo 6. Se o Safari não informar a
     economia de dados ao site, anotar no registro: o vídeo vai tocar
     sozinho.
8. Com o VoiceOver ligado, chegar ao vídeo.
   - Esperado: o vídeo é anunciado pela descrição do prato, e o botão é
     anunciado como "Pausar vídeo do prato" ou "Reproduzir vídeo do prato".
9. Abrir um prato cujo vídeo não carrega (URL inválida no cardápio de teste).
   - Esperado: fica a capa, sem mensagem de erro e sem botão.

## 2. Teclado (computador)

No painel e no admin, com Chrome e Safari no computador, sem mouse:

- Tab percorre tudo na ordem da tela, e o anel de foco aparece sempre.
- Os chips de categoria andam com as setas, Home e End.
- A folha do carrinho abre com o foco dentro, Esc fecha e o foco volta para
  quem abriu.
- A tabela rola para o lado com as setas depois de receber o foco.

## 3. VoiceOver no iPhone

No cardápio, do QR Code até "Pedido enviado":

- Cada botão só de ícone tem nome ("Pausar vídeo do prato", "Fechar").
- A quantidade é anunciada ao mudar ("Quantidade de Costela na brasa: 2").
- "Pedido enviado" é anunciado sem mudar o foco.

## 4. TalkBack no Android

O mesmo percurso do item 3, no Chrome do Android.

## 5. Zoom de 200% e tela de 320 px

- Cardápio e painel com zoom de 200%: nada cortado, sem rolagem lateral, salvo
  dentro da tabela.
- Cardápio a 320 px de largura: idem.

## 6. Movimento reduzido

Com "Reduzir movimento" ligado no sistema:

- Nenhuma animação (carregando, esqueleto, transições).
- O vídeo do prato não toca sozinho (ver item 1, passo 6).
