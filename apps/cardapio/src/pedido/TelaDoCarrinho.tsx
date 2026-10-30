import { Aviso, Botao, CampoTexto, FolhaInferior, formatarReais, SeletorQuantidade } from '@cardapio/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCaminho, useMesaPronta } from '../dados/contexto.ts';
import { Cardapio } from '../telas/Cardapio.tsx';
import { aposCriado, aposRecusa, mudarLinha, novaChave, QUANTIDADE_MAXIMA } from './carrinho.ts';
import { enviarPedido, type ProblemaDoPedido } from './envio.ts';
import estilos from './Pedido.module.css';
import { useCarrinho } from './usar-carrinho.ts';

type Situacao =
  | { readonly tipo: 'montando' | 'enviando' | 'sem-conexao' }
  | { readonly tipo: 'recusado'; readonly problema: ProblemaDoPedido };

function Recusa({ problema }: { readonly problema: ProblemaDoPedido }) {
  if (problema.codigo === 'PEDIDO_SESSAO_MESA_EXPIRADA') {
    return (
      <Aviso tipo="erro" titulo="Sessão encerrada">
        {problema.detail}
      </Aviso>
    );
  }
  return <Aviso tipo="erro">{problema.detail}</Aviso>;
}

export function TelaDoCarrinho() {
  const { mesa, cardapio } = useMesaPronta();
  const caminho = useCaminho();
  const navegar = useNavigate();
  const { carrinho, estado } = useCarrinho(mesa.slug, mesa.numero);
  const [situacao, setSituacao] = useState<Situacao>({ tipo: 'montando' });
  const pratos = new Map(cardapio.secoes.flatMap((secao) => secao.pratos).map((prato) => [prato.id, prato]));
  const indisponiveis = new Set(
    situacao.tipo === 'recusado' ? (situacao.problema.detalhes?.pratoIds ?? []) : [],
  );
  const total = estado.linhas.reduce(
    (soma, linha) => soma + (pratos.get(linha.pratoId)?.precoCentavos ?? 0) * linha.quantidade,
    0,
  );
  const fechar = () => void navegar(caminho());
  const mudar = (indice: number, mudanca: Parameters<typeof mudarLinha>[2]) => {
    carrinho.mudar((atual) => mudarLinha(atual, indice, mudanca, novaChave()));
    setSituacao({ tipo: 'montando' });
  };
  const enviar = () => {
    const chave = estado.chave ?? novaChave();
    if (estado.chave === null) {
      carrinho.mudar((atual) => ({ ...atual, chave }));
    }
    setSituacao({ tipo: 'enviando' });
    void enviarPedido(estado, chave).then((desfecho) => {
      if (desfecho.tipo === 'criado') {
        carrinho.mudar((atual) =>
          aposCriado(atual, { id: desfecho.pedido.id, numero: desfecho.pedido.numero }),
        );
        void navegar(caminho(`/pedido/${desfecho.pedido.id}`));
        return;
      }
      if (desfecho.tipo === 'recusado') {
        carrinho.mudar((atual) => aposRecusa(atual, novaChave()));
      }
      setSituacao(desfecho);
    });
  };
  const rodape =
    estado.linhas.length === 0 ? undefined : (
      <>
        <p className={estilos.total}>
          <span>Total</span>
          <span>{formatarReais(total)}</span>
        </p>
        <Botao larguraTotal onClick={enviar} disabled={situacao.tipo === 'enviando'}>
          {situacao.tipo === 'enviando'
            ? 'Enviando...'
            : situacao.tipo === 'sem-conexao'
              ? 'Tentar de novo'
              : 'Enviar pedido'}
        </Botao>
      </>
    );
  return (
    <>
      <Cardapio />
      <FolhaInferior
        aberta
        aoFechar={fechar}
        titulo="Seu pedido"
        rodape={rodape}
        rotuloFechar="Voltar ao cardápio"
      >
        {situacao.tipo === 'sem-conexao' && (
          <Aviso tipo="aviso" titulo="Sem conexão">
            Seu carrinho está guardado neste aparelho. Quando a conexão voltar, toque em Tentar de novo: o
            pedido não será duplicado.
          </Aviso>
        )}
        {situacao.tipo === 'recusado' && <Recusa problema={situacao.problema} />}
        {estado.linhas.length === 0 ? (
          <p>Seu carrinho está vazio. Escolha um prato no cardápio.</p>
        ) : (
          <ul className={estilos.lista}>
            {estado.linhas.map((linha, indice) => {
              const prato = pratos.get(linha.pratoId);
              const nome = prato?.nome ?? 'Item fora do cardápio';
              return (
                <li key={`${linha.pratoId}-${String(indice)}`} className={estilos.linha}>
                  <div className={estilos.topo}>
                    <p className={estilos.nome}>{nome}</p>
                    <span>{formatarReais((prato?.precoCentavos ?? 0) * linha.quantidade)}</span>
                  </div>
                  {indisponiveis.has(linha.pratoId) && (
                    <Aviso tipo="erro">Este item acabou. Tire-o do pedido para enviar.</Aviso>
                  )}
                  <SeletorQuantidade
                    nomeDoItem={nome}
                    valor={linha.quantidade}
                    minimo={0}
                    maximo={QUANTIDADE_MAXIMA}
                    aoMudar={(quantidade) => {
                      mudar(indice, { quantidade });
                    }}
                  />
                  <CampoTexto
                    rotulo={`Observação para ${nome}`}
                    maxLength={140}
                    value={linha.observacao}
                    onChange={(evento) => {
                      mudar(indice, { observacao: evento.target.value });
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <p className={estilos.nota}>
          O pedido vai direto para a equipe. Você pode cancelar enquanto ele não entrar em preparo.
        </p>
      </FolhaInferior>
    </>
  );
}
