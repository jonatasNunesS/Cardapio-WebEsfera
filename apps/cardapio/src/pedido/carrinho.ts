import { gerarUuidV7, type LinhaDoPedidoNaApi } from '@cardapio/contratos/publico';

export interface PedidoFeito {
  readonly id: string;
  readonly numero: number;
}

export interface EstadoDoCarrinho {
  readonly chave: string | null;
  readonly linhas: readonly LinhaDoPedidoNaApi[];
  readonly pedidos: readonly PedidoFeito[];
}

export const CARRINHO_VAZIO: EstadoDoCarrinho = { chave: null, linhas: [], pedidos: [] };
export const QUANTIDADE_MAXIMA = 20;

export const novaChave = () => gerarUuidV7(Date.now(), crypto.getRandomValues(new Uint8Array(10)));

export function adicionar(estado: EstadoDoCarrinho, pratoId: string, chave: string): EstadoDoCarrinho {
  const indice = estado.linhas.findIndex((linha) => linha.pratoId === pratoId && linha.observacao === '');
  const linhas =
    indice === -1
      ? [...estado.linhas, { pratoId, quantidade: 1, observacao: '' }]
      : estado.linhas.map((linha, i) =>
          i === indice ? { ...linha, quantidade: Math.min(QUANTIDADE_MAXIMA, linha.quantidade + 1) } : linha,
        );
  return { ...estado, linhas, chave };
}

export function mudarLinha(
  estado: EstadoDoCarrinho,
  indice: number,
  mudanca: Partial<Pick<LinhaDoPedidoNaApi, 'quantidade' | 'observacao'>>,
  chave: string,
): EstadoDoCarrinho {
  const linhas = estado.linhas
    .map((linha, i) => (i === indice ? { ...linha, ...mudanca } : linha))
    .filter((linha) => linha.quantidade > 0);
  return { ...estado, linhas, chave: linhas.length === 0 ? null : chave };
}

export function aposCriado(estado: EstadoDoCarrinho, pedido: PedidoFeito): EstadoDoCarrinho {
  const pedidos = estado.pedidos.some((feito) => feito.id === pedido.id)
    ? estado.pedidos
    : [...estado.pedidos, pedido];
  return { chave: null, linhas: [], pedidos };
}

export function aposRecusa(estado: EstadoDoCarrinho, chave: string): EstadoDoCarrinho {
  return { ...estado, chave };
}

function eEstado(valor: unknown): valor is EstadoDoCarrinho {
  const estado = valor as Partial<EstadoDoCarrinho> | null;
  return Array.isArray(estado?.linhas) && Array.isArray(estado.pedidos);
}

export interface Carrinho {
  readonly ler: () => EstadoDoCarrinho;
  readonly mudar: (transformar: (estado: EstadoDoCarrinho) => EstadoDoCarrinho) => void;
  readonly assinar: (ouvir: () => void) => () => void;
}

export function criarCarrinho(
  chaveDoArmazenamento: string,
  armazenamento: () => Storage | undefined,
): Carrinho {
  const ouvintes = new Set<() => void>();
  const lido: unknown = JSON.parse(armazenamento()?.getItem(chaveDoArmazenamento) ?? 'null');
  let atual: EstadoDoCarrinho = eEstado(lido) ? lido : CARRINHO_VAZIO;
  return {
    ler: () => atual,
    mudar: (transformar) => {
      atual = transformar(atual);
      armazenamento()?.setItem(chaveDoArmazenamento, JSON.stringify(atual));
      for (const ouvir of ouvintes) {
        ouvir();
      }
    },
    assinar: (ouvir) => {
      ouvintes.add(ouvir);
      return () => ouvintes.delete(ouvir);
    },
  };
}
