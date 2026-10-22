import type { RelatorDeErros } from '@cardapio/aplicacao';
import type { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { inject } from 'vitest';
import { sufixoUnico } from '../../banco/testes/apoio.ts';
import { criarConexoesDeFila, type ConexoesDeFila } from '../conexoes.ts';
import type { ExecutorDeTarefa, JobNaFila } from '../trabalhadores.ts';

export function urlRedisDeTeste(): string {
  return inject('urlRedisDeTeste');
}

export function prefixoDeTeste(): string {
  return `teste${sufixoUnico()}`;
}

export function abrirConexoesDeTeste(relator: RelatorDeErros, url = urlRedisDeTeste()): ConexoesDeFila {
  return criarConexoesDeFila(url, relator);
}

export function abrirRedisSimples(url = urlRedisDeTeste()): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export async function apagarPrefixo(redis: Redis, prefixo: string): Promise<void> {
  let cursor = '0';
  do {
    const [proximo, chaves] = await redis.scan(cursor, 'MATCH', `${prefixo}:*`, 'COUNT', 500);
    cursor = proximo;
    if (chaves.length > 0) {
      await redis.del(...chaves);
    }
  } while (cursor !== '0');
}

export interface FalhaReportada {
  readonly erro: unknown;
  readonly job: JobNaFila;
  readonly restauranteId: unknown;
}

export interface ExecutorDeTeste {
  readonly executar: ExecutorDeTarefa;
  readonly reportadas: FalhaReportada[];
  readonly execucoes: JobNaFila[];
}

export function criarExecutorDeTeste(): ExecutorDeTeste {
  const reportadas: FalhaReportada[] = [];
  const execucoes: JobNaFila[] = [];
  const executar: ExecutorDeTarefa = async (_nome, dados, tarefa, opcoes) => {
    execucoes.push(opcoes.job);
    try {
      return await tarefa();
    } catch (erro) {
      if (opcoes.reportarFalha(erro)) {
        reportadas.push({ erro, job: opcoes.job, restauranteId: dados.restauranteId });
      }
      throw erro;
    }
  };
  return { executar, reportadas, execucoes };
}

export async function esperarAte(condicao: () => Promise<boolean> | boolean, limiteMs = 10_000) {
  const inicio = Date.now();
  while (!(await condicao())) {
    if (Date.now() - inicio > limiteMs) {
      throw new Error('condição não atingida no prazo');
    }
    await new Promise((resolver) => setTimeout(resolver, 25));
  }
}

export async function estadoDoJob(fila: Queue, id: string): Promise<string | undefined> {
  const job = await fila.getJob(id);
  return job === undefined ? undefined : job.getState();
}

export interface ProxyTcp {
  readonly url: string;
  derrubar(): Promise<void>;
  religar(): Promise<void>;
}

function ouvir(servidor: Server, porta: number): Promise<number> {
  return new Promise((resolver) => {
    servidor.listen(porta, '127.0.0.1', () => {
      const endereco = servidor.address();
      resolver(typeof endereco === 'object' && endereco !== null ? endereco.port : porta);
    });
  });
}

export async function criarProxyTcp(destino: string): Promise<ProxyTcp> {
  const alvo = new URL(destino);
  const conexoes = new Set<Socket>();
  const criarServidor = () =>
    createServer((entrada) => {
      const saida = createConnection(Number(alvo.port || 6379), alvo.hostname);
      for (const socket of [entrada, saida]) {
        conexoes.add(socket);
        socket.on('close', () => conexoes.delete(socket));
        socket.on('error', () => socket.destroy());
      }
      entrada.pipe(saida).pipe(entrada);
    });
  let servidor = criarServidor();
  const porta = await ouvir(servidor, 0);
  const url = new URL(destino);
  url.hostname = '127.0.0.1';
  url.port = String(porta);
  return {
    url: url.toString(),
    async derrubar() {
      for (const socket of conexoes) {
        socket.destroy();
      }
      await new Promise((resolver) => servidor.close(resolver));
    },
    async religar() {
      servidor = criarServidor();
      await ouvir(servidor, porta);
    },
  };
}
