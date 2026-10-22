import {
  CODIGOS,
  ErroAplicacao,
  ErroDependenciaExterna,
  type FilaDeJobs,
  type JobEnfileirado,
  type PedidoDeJob,
  type RelatorDeErros,
} from '@cardapio/aplicacao';
import { NOMES_DAS_FILAS, type NomeDaFila } from '@cardapio/contratos';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { criarLimitadorPorRestaurante } from './limitador-por-restaurante.ts';
import { REGISTRO_DE_FILAS } from './registro.ts';
import { exigirIdDoJob, validarJob, type JobValido } from './validar-job.ts';

export interface OpcoesDasFilas {
  readonly conexao: Redis;
  readonly relator: RelatorDeErros;
  readonly prefixo?: string | undefined;
  readonly idRastreioAtual?: (() => string | undefined) | undefined;
}

export interface FilasBullMQ extends FilaDeJobs {
  readonly filas: ReadonlyMap<NomeDaFila, Queue>;
  encerrar(): Promise<void>;
}

export function criarFila(nome: NomeDaFila, opcoes: OpcoesDasFilas): Queue {
  const fila = new Queue(nome, {
    connection: opcoes.conexao,
    ...(opcoes.prefixo === undefined ? {} : { prefix: opcoes.prefixo }),
  });
  fila.on('error', (erro) => {
    opcoes.relator.registrarPasso({ categoria: 'filas', mensagem: erro.message, dados: { fila: nome } });
  });
  return fila;
}

function comEnvelope(pedido: PedidoDeJob, idRastreio: string | undefined): Record<string, unknown> {
  return {
    ...pedido.dados,
    ...(pedido.restauranteId === undefined ? {} : { restauranteId: pedido.restauranteId }),
    ...(idRastreio === undefined ? {} : { idRastreio }),
  };
}

function opcoesDoJob(job: JobValido, idDoJob: string, atrasoMs: number) {
  const configuracao = REGISTRO_DE_FILAS[job.fila];
  return {
    jobId: idDoJob,
    attempts: configuracao.tentativas,
    backoff: configuracao.backoff,
    priority: configuracao.prioridade,
    removeOnComplete: configuracao.retencao.concluidos,
    removeOnFail: configuracao.retencao.falhas,
    ...(atrasoMs > 0 ? { delay: atrasoMs } : {}),
  };
}

function falhaAoEnfileirar(erro: unknown, job: JobValido): ErroDependenciaExterna {
  return new ErroDependenciaExterna(
    CODIGOS.FILA_ENFILEIRAR_FALHOU,
    'O Redis não aceitou o job',
    { modulo: 'filas', casoDeUso: 'enfileirar', dados: { fila: job.fila, job: job.nome } },
    { provedor: 'redis', operacao: 'enfileirar' },
    erro,
  );
}

export function criarFilasBullMQ(opcoes: OpcoesDasFilas): FilasBullMQ {
  const filas = new Map(NOMES_DAS_FILAS.map((nome) => [nome, criarFila(nome, opcoes)] as const));
  const limitador = criarLimitadorPorRestaurante(opcoes.conexao);

  async function atrasoPara(job: JobValido, restauranteId: string | undefined): Promise<number> {
    const limite = REGISTRO_DE_FILAS[job.fila].limitePorRestaurante;
    if (limite === null || restauranteId === undefined) {
      return 0;
    }
    return limitador.atrasoMs(job.nome, restauranteId, limite);
  }

  async function enfileirarValido(job: JobValido, pedido: PedidoDeJob): Promise<JobEnfileirado> {
    const fila = filas.get(job.fila);
    if (fila === undefined) {
      throw new ErroAplicacao(CODIGOS.FILA_JOB_DESCONHECIDO, 'Fila sem registro', {
        modulo: 'filas',
        casoDeUso: 'enfileirar',
        dados: { fila: job.fila },
      });
    }
    try {
      if ((await fila.getJob(pedido.idDoJob)) !== undefined) {
        return { situacao: 'duplicado', atrasoMs: 0 };
      }
      const atrasoMs = await atrasoPara(job, pedido.restauranteId);
      await fila.add(job.nome, job.dados, opcoesDoJob(job, pedido.idDoJob, atrasoMs));
      return { situacao: 'enfileirado', atrasoMs };
    } catch (erro) {
      throw falhaAoEnfileirar(erro, job);
    }
  }

  return {
    filas,
    async enfileirar(pedido) {
      exigirIdDoJob(pedido.idDoJob, pedido.nome);
      const job = validarJob(pedido.nome, comEnvelope(pedido, opcoes.idRastreioAtual?.()), 'enfileirar');
      return enfileirarValido(job, pedido);
    },
    async encerrar() {
      await Promise.all([...filas.values()].map((fila) => fila.close()));
    },
  };
}
