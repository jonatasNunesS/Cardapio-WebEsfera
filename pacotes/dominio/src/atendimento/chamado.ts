export type TipoDeChamado = 'garcom' | 'conta';
export type SituacaoDoChamado = 'aguardando' | 'em_atendimento' | 'concluido' | 'cancelado';

const TRANSICOES: Readonly<Record<SituacaoDoChamado, readonly SituacaoDoChamado[]>> = {
  aguardando: ['em_atendimento', 'cancelado'],
  em_atendimento: ['concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
};

export function chamadoPodeTransitar(de: SituacaoDoChamado, para: SituacaoDoChamado): boolean {
  return TRANSICOES[de].includes(para);
}

export function chamadoEstaAberto(situacao: SituacaoDoChamado): boolean {
  return situacao === 'aguardando' || situacao === 'em_atendimento';
}

export function clientePodeCancelarChamado(situacao: SituacaoDoChamado): boolean {
  return situacao === 'aguardando';
}
