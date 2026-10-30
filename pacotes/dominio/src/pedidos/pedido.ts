export type SituacaoDoPedido = 'enviado' | 'em_preparo' | 'pronto' | 'entregue' | 'cancelado';

const TRANSICOES: Readonly<Record<SituacaoDoPedido, readonly SituacaoDoPedido[]>> = {
  enviado: ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto: ['entregue', 'cancelado'],
  entregue: [],
  cancelado: [],
};

export function podeTransitar(de: SituacaoDoPedido, para: SituacaoDoPedido): boolean {
  return TRANSICOES[de].includes(para);
}

export function clientePodeCancelar(situacao: SituacaoDoPedido): boolean {
  return situacao === 'enviado';
}
