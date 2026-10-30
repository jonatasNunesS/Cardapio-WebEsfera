import type { RespostaPedido, SituacaoDoPedidoNaApi } from '@cardapio/contratos/publico';
import { Aviso, Botao, formatarReais, LinkBotao } from '@cardapio/ui';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useCaminho } from '../dados/contexto.ts';
import { cancelarPedido, consultarPedido, type ProblemaDoPedido } from './envio.ts';
import estilos from './Pedido.module.css';

const INTERVALO_DA_CONSULTA_MS = 15_000;

const PASSOS: readonly { readonly situacao: SituacaoDoPedidoNaApi; readonly texto: string }[] = [
  { situacao: 'enviado', texto: 'Enviado para a equipe' },
  { situacao: 'em_preparo', texto: 'Em preparo' },
  { situacao: 'pronto', texto: 'Pronto, a caminho da mesa' },
  { situacao: 'entregue', texto: 'Entregue' },
];

function Passos({ situacao }: { readonly situacao: SituacaoDoPedidoNaApi }) {
  if (situacao === 'cancelado') {
    return <Aviso tipo="informacao">Pedido cancelado.</Aviso>;
  }
  return (
    <ol className={estilos.passos}>
      {PASSOS.map((passo) => (
        <li key={passo.situacao} className={passo.situacao === situacao ? estilos.atual : undefined}>
          {passo.texto}
          {passo.situacao === situacao && ' (agora)'}
        </li>
      ))}
    </ol>
  );
}

function usePedido(id: string) {
  const [pedido, setPedido] = useState<RespostaPedido | ProblemaDoPedido | null | undefined>(undefined);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let ativo = true;
    void consultarPedido(id).then((lido) => {
      if (ativo) {
        setPedido(lido);
      }
    });
    const proxima = setTimeout(() => {
      setVersao((atual) => atual + 1);
    }, INTERVALO_DA_CONSULTA_MS);
    return () => {
      ativo = false;
      clearTimeout(proxima);
    };
  }, [id, versao]);
  return {
    pedido,
    recarregar: () => {
      setVersao((atual) => atual + 1);
    },
  };
}

export function TelaDoPedido() {
  const { pedidoId = '' } = useParams();
  const caminho = useCaminho();
  const { pedido, recarregar } = usePedido(pedidoId);
  const [erro, setErro] = useState<string | null>(null);
  if (pedido === undefined) {
    return (
      <main className={estilos.status} aria-busy="true">
        <p>Carregando o pedido...</p>
      </main>
    );
  }
  if (pedido === null || !('numero' in pedido)) {
    return (
      <main className={estilos.status}>
        <h1 className={estilos.titulo}>Acompanhe seu pedido</h1>
        <Aviso tipo="aviso">
          {pedido === null ? 'Sem conexão. Vamos tentar de novo em instantes.' : pedido.detail}
        </Aviso>
        <LinkBotao variante="secundario" href={caminho()}>
          Voltar ao cardápio
        </LinkBotao>
      </main>
    );
  }
  return (
    <main className={estilos.status}>
      <h1 className={estilos.titulo}>Pedido {pedido.numero}</h1>
      <p>
        {formatarReais(pedido.totalCentavos)} ·{' '}
        {pedido.itens.map((item) => `${String(item.quantidade)}x ${item.nome}`).join(', ')}
      </p>
      <Passos situacao={pedido.situacao} />
      {erro !== null && <Aviso tipo="erro">{erro}</Aviso>}
      <div className={estilos.acoes}>
        <LinkBotao variante="secundario" href={caminho()}>
          Voltar ao cardápio
        </LinkBotao>
        {pedido.situacao === 'enviado' && (
          <Botao
            variante="perigo"
            onClick={() => {
              void cancelarPedido(pedido.id).then((problema) => {
                setErro(problema?.detail ?? null);
                recarregar();
              });
            }}
          >
            Cancelar pedido
          </Botao>
        )}
      </div>
    </main>
  );
}
