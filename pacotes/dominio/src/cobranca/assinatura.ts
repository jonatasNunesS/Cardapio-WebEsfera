import { LIMITE_MESAS_TESTE } from '../mesas/mesa.ts';

export type SituacaoDaAssinatura = 'pendente' | 'autorizada' | 'pausada' | 'cancelada';

export type SituacaoDaCobranca = 'agendada' | 'paga' | 'recusada' | 'em_retentativa' | 'cancelada';

export const MESES_COBERTOS_POR_PAGAMENTO = 1;

export interface PlanoDaAssinatura {
  readonly situacao: SituacaoDaAssinatura;
  readonly limiteMesas: number;
}

export function limiteDeMesasPelaAssinatura(assinatura: PlanoDaAssinatura | null): number {
  return assinatura?.situacao === 'autorizada' ? assinatura.limiteMesas : LIMITE_MESAS_TESTE;
}

export function coberturaDoPagamento(venceEm: Date): Date {
  const fim = new Date(venceEm.getTime());
  fim.setUTCMonth(fim.getUTCMonth() + MESES_COBERTOS_POR_PAGAMENTO);
  return fim;
}

export function pagoAtePelasCobrancas(
  cobrancas: readonly { readonly situacao: SituacaoDaCobranca; readonly venceEm: Date }[],
): Date | null {
  return cobrancas
    .filter((cobranca) => cobranca.situacao === 'paga')
    .map((cobranca) => coberturaDoPagamento(cobranca.venceEm))
    .reduce<Date | null>((maior, fim) => (maior === null || fim > maior ? fim : maior), null);
}
