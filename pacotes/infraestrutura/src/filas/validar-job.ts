import { CODIGOS, ErroAplicacao } from '@cardapio/aplicacao';
import { JOBS, PADRAO_DO_ID_DO_JOB, type NomeDaFila, type NomeDoJob } from '@cardapio/contratos';

export interface JobValido {
  readonly nome: NomeDoJob;
  readonly fila: NomeDaFila;
  readonly dados: Readonly<Record<string, unknown>>;
}

function falha(codigo: string, mensagem: string, casoDeUso: string, dados: Record<string, unknown>) {
  return new ErroAplicacao(codigo, mensagem, { modulo: 'filas', casoDeUso, dados });
}

function ehNomeDeJob(nome: string): nome is NomeDoJob {
  return Object.hasOwn(JOBS, nome);
}

export function exigirIdDoJob(idDoJob: string, nome: string): void {
  if (!PADRAO_DO_ID_DO_JOB.test(idDoJob) || /^\d+$/.test(idDoJob)) {
    throw falha(CODIGOS.FILA_ENFILEIRAR_ID_INVALIDO, 'Id de job fora do padrão', 'enfileirar', { job: nome });
  }
}

export function validarJob(nome: string, dados: unknown, casoDeUso: string): JobValido {
  if (!ehNomeDeJob(nome)) {
    throw falha(CODIGOS.FILA_JOB_DESCONHECIDO, 'Job sem contrato registrado', casoDeUso, { job: nome });
  }
  const definicao = JOBS[nome];
  const resultado = definicao.esquema.safeParse(dados);
  if (!resultado.success) {
    const campos = resultado.error.issues.map((problema) => problema.path.join('.'));
    throw falha(CODIGOS.FILA_JOB_PAYLOAD_INVALIDO, 'Payload do job fora do contrato', casoDeUso, {
      job: nome,
      campos,
    });
  }
  return { nome, fila: definicao.fila, dados: resultado.data };
}
