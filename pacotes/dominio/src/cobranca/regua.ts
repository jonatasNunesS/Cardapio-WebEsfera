import type { SituacaoDoRestaurante } from '../restaurantes/restaurante.ts';

export const DIA_DA_CARENCIA = 1;
export const DIA_DA_INADIMPLENCIA = 15;
const MILISSEGUNDOS_POR_DIA = 86_400_000;

export interface EstadoDaCobranca {
  readonly situacaoAtual: SituacaoDoRestaurante;
  readonly testeTerminaEm: Date;
  readonly pagoAte: Date | null;
  readonly fusoHorario: string;
}

function diaLocal(instante: Date, fusoHorario: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value ?? '0');
  return Date.UTC(valor('year'), valor('month') - 1, valor('day')) / MILISSEGUNDOS_POR_DIA;
}

export function vencimentoDoAcesso(estado: Pick<EstadoDaCobranca, 'testeTerminaEm' | 'pagoAte'>): Date {
  const { testeTerminaEm, pagoAte } = estado;
  return pagoAte !== null && pagoAte > testeTerminaEm ? pagoAte : testeTerminaEm;
}

export function diaDeAtraso(vencimento: Date, agora: Date, fusoHorario: string): number {
  if (agora < vencimento) {
    return 0;
  }
  return diaLocal(agora, fusoHorario) - diaLocal(vencimento, fusoHorario) + DIA_DA_CARENCIA;
}

export function situacaoPelaRegua(estado: EstadoDaCobranca, agora: Date): SituacaoDoRestaurante {
  if (estado.situacaoAtual === 'cancelado') {
    return 'cancelado';
  }
  const vencimento = vencimentoDoAcesso(estado);
  const dia = diaDeAtraso(vencimento, agora, estado.fusoHorario);
  if (dia >= DIA_DA_INADIMPLENCIA) {
    return 'inadimplente';
  }
  if (dia >= DIA_DA_CARENCIA) {
    return 'carencia';
  }
  return estado.pagoAte !== null && agora < estado.pagoAte ? 'ativo' : 'teste';
}

export function podeReceberPedido(situacao: SituacaoDoRestaurante): boolean {
  return situacao === 'teste' || situacao === 'ativo' || situacao === 'carencia';
}
