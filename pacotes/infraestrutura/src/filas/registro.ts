import type { NomeDaFila } from '@cardapio/contratos';
import { availableParallelism } from 'node:os';

const MINUTO_EM_S = 60;
const DIA_EM_S = 24 * 60 * MINUTO_EM_S;

export interface Retencao {
  readonly age: number;
  readonly count: number;
}

export interface LimitePorRestaurante {
  readonly porMinuto: number;
  readonly rajada: number;
}

export interface ConfiguracaoDaFila {
  readonly concorrencia: number;
  readonly tentativas: number;
  readonly backoff: { readonly type: 'fixed' | 'exponential'; readonly delay: number };
  readonly prioridade: number;
  readonly retencao: { readonly concluidos: Retencao; readonly falhas: Retencao };
  readonly limitePorRestaurante: LimitePorRestaurante | null;
}

const retencaoPadrao = {
  concluidos: { age: DIA_EM_S, count: 1000 },
  falhas: { age: 14 * DIA_EM_S, count: 5000 },
} as const;

export const REGISTRO_DE_FILAS: Readonly<Record<NomeDaFila, ConfiguracaoDaFila>> = {
  pagamentos: {
    concorrencia: 5,
    tentativas: 8,
    backoff: { type: 'exponential', delay: 5000 },
    prioridade: 1,
    retencao: { concluidos: retencaoPadrao.concluidos, falhas: { age: 30 * DIA_EM_S, count: 10_000 } },
    limitePorRestaurante: { porMinuto: 120, rajada: 30 },
  },
  midia: {
    concorrencia: Math.max(1, availableParallelism() - 1),
    tentativas: 5,
    backoff: { type: 'exponential', delay: 10_000 },
    prioridade: 5,
    retencao: retencaoPadrao,
    limitePorRestaurante: { porMinuto: 30, rajada: 10 },
  },
  notificacoes: {
    concorrencia: 10,
    tentativas: 5,
    backoff: { type: 'exponential', delay: 3000 },
    prioridade: 3,
    retencao: retencaoPadrao,
    limitePorRestaurante: { porMinuto: 60, rajada: 20 },
  },
  'caixa-saida': {
    concorrencia: 1,
    tentativas: 1,
    backoff: { type: 'fixed', delay: 1000 },
    prioridade: 1,
    retencao: { concluidos: { age: 10 * MINUTO_EM_S, count: 100 }, falhas: retencaoPadrao.falhas },
    limitePorRestaurante: null,
  },
  rotinas: {
    concorrencia: 2,
    tentativas: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    prioridade: 5,
    retencao: { concluidos: { age: DIA_EM_S, count: 200 }, falhas: retencaoPadrao.falhas },
    limitePorRestaurante: null,
  },
};
