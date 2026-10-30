import type { SituacaoDoPedido } from '../pedidos/pedido.ts';

export const TAXA_DE_SERVICO_PERCENTUAL = 10;
export const PESSOAS_MAXIMAS = 20;

export interface PedidoDaConta {
  readonly situacao: SituacaoDoPedido;
  readonly totalCentavos: number;
}

export interface ResumoDaConta {
  readonly subtotalCentavos: number;
  readonly taxaCentavos: number;
  readonly totalComTaxaCentavos: number;
  readonly totalSemTaxaCentavos: number;
  readonly porPessoa: {
    readonly comTaxa: readonly number[];
    readonly semTaxa: readonly number[];
  };
}

export function taxaDeServico(subtotalCentavos: number): number {
  return Math.floor((subtotalCentavos * TAXA_DE_SERVICO_PERCENTUAL + 50) / 100);
}

export function dividirPorPessoas(totalCentavos: number): readonly number[] {
  return Array.from({ length: PESSOAS_MAXIMAS }, (_, indice) => Math.ceil(totalCentavos / (indice + 1)));
}

export function resumirConta(pedidos: readonly PedidoDaConta[]): ResumoDaConta {
  const subtotalCentavos = pedidos
    .filter((pedido) => pedido.situacao !== 'cancelado')
    .reduce((soma, pedido) => soma + pedido.totalCentavos, 0);
  const taxaCentavos = taxaDeServico(subtotalCentavos);
  const totalComTaxaCentavos = subtotalCentavos + taxaCentavos;
  return {
    subtotalCentavos,
    taxaCentavos,
    totalComTaxaCentavos,
    totalSemTaxaCentavos: subtotalCentavos,
    porPessoa: {
      comTaxa: dividirPorPessoas(totalComTaxaCentavos),
      semTaxa: dividirPorPessoas(subtotalCentavos),
    },
  };
}
