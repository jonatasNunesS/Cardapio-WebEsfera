import { formatarReais, Icone } from '@cardapio/ui';
import { Link } from 'react-router';
import { caminhoDaMesa, type MesaPronta } from '../dados/contexto.ts';
import estilos from './BarraDoPedido.module.css';
import { useCarrinho } from './usar-carrinho.ts';

export function BarraDoPedido({ contexto }: { readonly contexto: MesaPronta }) {
  const { mesa, cardapio, codigo } = contexto;
  const caminho = (trecho: string) => caminhoDaMesa(mesa, codigo, trecho);
  const naTelaDoPedido = /\/(carrinho|pedido\/|obrigado)/.test(location.pathname);
  const { estado } = useCarrinho(mesa.slug, mesa.numero);
  const ultimo = estado.pedidos.at(-1);
  if (naTelaDoPedido) {
    return null;
  }
  if (estado.linhas.length > 0) {
    const precos = new Map(cardapio.secoes.flatMap((s) => s.pratos).map((p) => [p.id, p.precoCentavos]));
    const itens = estado.linhas.reduce((soma, linha) => soma + linha.quantidade, 0);
    const total = estado.linhas.reduce((soma, l) => soma + (precos.get(l.pratoId) ?? 0) * l.quantidade, 0);
    return (
      <nav aria-label="Seu pedido">
        <Link className={estilos.barra} to={caminho('/carrinho')}>
          <Icone nome="carrinho" tamanho={20} />
          Ver pedido: {itens} {itens === 1 ? 'item' : 'itens'}, {formatarReais(total)}
        </Link>
      </nav>
    );
  }
  return ultimo === undefined ? null : (
    <nav aria-label="Seu pedido">
      <Link className={estilos.barra} to={caminho(`/pedido/${ultimo.id}`)}>
        Acompanhar o pedido {ultimo.numero}
      </Link>
    </nav>
  );
}
