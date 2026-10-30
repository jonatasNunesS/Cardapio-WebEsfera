import type { RelatorDeErros } from '@cardapio/aplicacao';
import type { NomeDoJob } from '@cardapio/contratos';
import type { Redis } from 'ioredis';
import { criarFila } from './fila-de-jobs.ts';
import { REGISTRO_DE_FILAS } from './registro.ts';
import { validarJob } from './validar-job.ts';

export interface Agendamento {
  readonly nome: NomeDoJob;
  readonly aCadaMs: number;
}

const DIA_EM_MS = 24 * 60 * 60_000;

export const AGENDAMENTOS: readonly Agendamento[] = [
  { nome: 'publicar-caixa-saida', aCadaMs: 1000 },
  { nome: 'expirar-sessoes-mesa', aCadaMs: 5 * 60_000 },
  { nome: 'conciliar-cobrancas', aCadaMs: DIA_EM_MS },
  { nome: 'aplicar-inadimplencia', aCadaMs: DIA_EM_MS },
];

export interface OpcoesDosAgendamentos {
  readonly agendamentos?: readonly Agendamento[] | undefined;
  readonly prefixo?: string | undefined;
}

async function agendar(conexao: Redis, relator: RelatorDeErros, agendamento: Agendamento, prefixo?: string) {
  const job = validarJob(agendamento.nome, {}, 'agendar');
  const configuracao = REGISTRO_DE_FILAS[job.fila];
  const fila = criarFila(job.fila, { conexao, relator, prefixo });
  await fila.upsertJobScheduler(
    agendamento.nome,
    { every: agendamento.aCadaMs },
    {
      name: agendamento.nome,
      data: job.dados,
      opts: {
        attempts: configuracao.tentativas,
        backoff: configuracao.backoff,
        removeOnComplete: configuracao.retencao.concluidos,
        removeOnFail: configuracao.retencao.falhas,
      },
    },
  );
  await fila.close();
}

export async function registrarAgendamentos(
  conexao: Redis,
  relator: RelatorDeErros,
  opcoes: OpcoesDosAgendamentos = {},
): Promise<void> {
  for (const agendamento of opcoes.agendamentos ?? AGENDAMENTOS) {
    await agendar(conexao, relator, agendamento, opcoes.prefixo);
  }
}
