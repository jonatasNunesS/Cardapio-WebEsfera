import { CODIGOS, ErroAplicacao, type RelatorDeErros } from '@cardapio/aplicacao';
import { NOMES_DAS_FILAS, type NomeDaFila, type NomeDoJob } from '@cardapio/contratos';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { AcessoAoBanco, Transacao } from '../banco/banco.ts';
import { REGISTRO_DE_FILAS } from './registro.ts';
import { validarJob } from './validar-job.ts';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODIGOS_DEFINITIVOS: ReadonlySet<string> = new Set([
  CODIGOS.FILA_JOB_DESCONHECIDO,
  CODIGOS.FILA_JOB_PAYLOAD_INVALIDO,
  CODIGOS.MIDIA_PROCESSAR_FERRAMENTA_FALHOU,
  CODIGOS.MIDIA_PROCESSAR_TEMPO_ESGOTADO,
]);

// Job que chama serviço externo demorado abre as próprias transações curtas: docs/adr/0011-midia-e-video.md
export const JOBS_EM_TRANSACOES_CURTAS: ReadonlySet<NomeDoJob> = new Set([
  'processar-midia',
  'descartar-midia',
  'apagar-original-midia',
]);

export interface JobNaFila {
  readonly fila: string;
  readonly id: string;
  readonly tentativa: number;
}

export interface OpcoesDoExecutor {
  readonly job: JobNaFila;
  readonly reportarFalha: (erro: unknown) => boolean;
}

export type ExecutorDeTarefa = <T>(
  nome: string,
  dados: Readonly<Record<string, unknown>>,
  executar: () => Promise<T>,
  opcoes: OpcoesDoExecutor,
) => Promise<T>;

export interface ExecucaoDoJob {
  readonly nome: NomeDoJob;
  readonly dados: Readonly<Record<string, unknown>>;
  readonly transacao?: Transacao | undefined;
}

export type Processador = (execucao: ExecucaoDoJob) => Promise<unknown>;

export interface OpcoesDosTrabalhadores {
  readonly conexao: Redis;
  readonly banco: AcessoAoBanco;
  readonly relator: RelatorDeErros;
  readonly processadores: Readonly<Partial<Record<NomeDoJob, Processador>>>;
  readonly executarTarefa: ExecutorDeTarefa;
  readonly aoEsgotarTentativas?: ((nome: string, dados: unknown) => Promise<void>) | undefined;
  readonly filas?: readonly NomeDaFila[] | undefined;
  readonly prefixo?: string | undefined;
}

export interface Trabalhadores {
  readonly workers: ReadonlyMap<NomeDaFila, Worker>;
  encerrar(limiteMs: number): Promise<'concluido' | 'forcado'>;
}

export function ehFalhaDefinitiva(erro: unknown): boolean {
  return erro instanceof ErroAplicacao && CODIGOS_DEFINITIVOS.has(erro.codigo);
}

function envelopeDoContexto(dados: unknown): Record<string, unknown> {
  if (typeof dados !== 'object' || dados === null) {
    return {};
  }
  const { restauranteId, idRastreio } = dados as Record<string, unknown>;
  return {
    ...(typeof restauranteId === 'string' && PADRAO_UUID.test(restauranteId) ? { restauranteId } : {}),
    ...(typeof idRastreio === 'string' ? { idRastreio } : {}),
  };
}

function exigirProcessador(opcoes: OpcoesDosTrabalhadores, nome: NomeDoJob): Processador {
  const processador = opcoes.processadores[nome];
  if (processador === undefined) {
    throw new ErroAplicacao(CODIGOS.FILA_JOB_DESCONHECIDO, 'Job sem processador registrado', {
      modulo: 'filas',
      casoDeUso: 'processar',
      dados: { job: nome },
    });
  }
  return processador;
}

function processarValidado(opcoes: OpcoesDosTrabalhadores, fila: NomeDaFila, job: Job): Promise<unknown> {
  const valido = validarJob(job.name, job.data, 'processar');
  if (valido.fila !== fila) {
    throw new ErroAplicacao(CODIGOS.FILA_JOB_DESCONHECIDO, 'Job na fila errada', {
      modulo: 'filas',
      casoDeUso: 'processar',
      dados: { job: job.name, fila },
    });
  }
  const processador = exigirProcessador(opcoes, valido.nome);
  const { restauranteId } = valido.dados;
  if (typeof restauranteId !== 'string' || JOBS_EM_TRANSACOES_CURTAS.has(valido.nome)) {
    return processador({ nome: valido.nome, dados: valido.dados });
  }
  return opcoes.banco.comRestaurante(restauranteId, (transacao) =>
    processador({ nome: valido.nome, dados: valido.dados, transacao }),
  );
}

interface Contador {
  emAndamento: number;
}

function criarProcessadorDaFila(opcoes: OpcoesDosTrabalhadores, fila: NomeDaFila, contador: Contador) {
  const processar = processarComEnvelope(opcoes, fila);
  return async (job: Job) => {
    contador.emAndamento += 1;
    try {
      return await processar(job);
    } finally {
      contador.emAndamento -= 1;
    }
  };
}

async function avisarEsgotamento(opcoes: OpcoesDosTrabalhadores, job: Job): Promise<void> {
  await Promise.resolve(opcoes.aoEsgotarTentativas?.(job.name, job.data)).catch((erro: unknown) => {
    opcoes.relator.reportar(erro, { tarefa: 'aoEsgotarTentativas', job: job.name });
  });
}

function processarComEnvelope(opcoes: OpcoesDosTrabalhadores, fila: NomeDaFila) {
  return async (job: Job) => {
    const tentativa = job.attemptsMade + 1;
    const ultima = tentativa >= (job.opts.attempts ?? 1);
    const emExecucao = { fila, id: job.id ?? '', tentativa };
    try {
      return await opcoes.executarTarefa(
        `${fila}.${job.name}`,
        envelopeDoContexto(job.data),
        () => processarValidado(opcoes, fila, job),
        { job: emExecucao, reportarFalha: (erro) => ultima || ehFalhaDefinitiva(erro) },
      );
    } catch (erro) {
      if (ultima || ehFalhaDefinitiva(erro)) {
        await avisarEsgotamento(opcoes, job);
      }
      if (!ehFalhaDefinitiva(erro)) {
        throw erro;
      }
      const definitiva = new UnrecoverableError(erro instanceof Error ? erro.message : 'falha definitiva');
      definitiva.cause = erro;
      throw definitiva;
    }
  };
}

function criarWorker(opcoes: OpcoesDosTrabalhadores, fila: NomeDaFila, contador: Contador): Worker {
  const worker = new Worker(fila, criarProcessadorDaFila(opcoes, fila, contador), {
    connection: opcoes.conexao,
    concurrency: REGISTRO_DE_FILAS[fila].concorrencia,
    ...(opcoes.prefixo === undefined ? {} : { prefix: opcoes.prefixo }),
  });
  worker.on('error', (erro) => {
    opcoes.relator.registrarPasso({ categoria: 'filas', mensagem: erro.message, dados: { fila } });
  });
  return worker;
}

function limiteEfetivo(opcoes: OpcoesDosTrabalhadores, contador: Contador, limiteMs: number): number {
  return opcoes.conexao.status === 'ready' || contador.emAndamento > 0 ? limiteMs : 0;
}

function esperar(limiteMs: number) {
  let temporizador: NodeJS.Timeout | undefined;
  const promessa = new Promise<'forcado'>((resolver) => {
    temporizador = setTimeout(() => {
      resolver('forcado');
    }, limiteMs);
  });
  return {
    promessa,
    cancelar: () => {
      clearTimeout(temporizador);
    },
  };
}

export function iniciarTrabalhadores(opcoes: OpcoesDosTrabalhadores): Trabalhadores {
  const nomes = opcoes.filas ?? NOMES_DAS_FILAS;
  const contador: Contador = { emAndamento: 0 };
  const workers = new Map(nomes.map((fila) => [fila, criarWorker(opcoes, fila, contador)] as const));
  return {
    workers,
    async encerrar(limiteMs) {
      const fechar = Promise.all([...workers.values()].map((worker) => worker.close())).then(
        () => 'concluido' as const,
        (erro: unknown) => {
          opcoes.relator.reportar(erro);
          return 'concluido' as const;
        },
      );
      const limite = esperar(limiteEfetivo(opcoes, contador, limiteMs));
      const resultado = await Promise.race([fechar, limite.promessa]);
      limite.cancelar();
      if (resultado === 'forcado') {
        opcoes.relator.registrarPasso({
          categoria: 'filas',
          mensagem: 'encerramento forçado',
          dados: { emAndamento: contador.emAndamento },
        });
      }
      return resultado;
    },
  };
}
