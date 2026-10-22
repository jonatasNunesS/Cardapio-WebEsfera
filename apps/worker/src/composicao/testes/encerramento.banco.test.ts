import { criarFila, criarRedis, fecharRedis } from '@cardapio/infraestrutura';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { describe, expect, inject, it } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    urlRedisDeTeste: string;
  }
}

const FIXTURA = fileURLToPath(new URL('./worker-com-job-lento.ts', import.meta.url));

const relatorMudo = { reportar: () => randomUUID(), registrarPasso: () => undefined };

function esperarMensagem(processo: ReturnType<typeof fork>, situacao: string): Promise<void> {
  return new Promise((resolver) => {
    processo.on('message', (mensagem: { situacao?: string }) => {
      if (mensagem.situacao === situacao) {
        resolver();
      }
    });
  });
}

describe('encerramento gracioso do worker', () => {
  it('SIGTERM com job em andamento: o job termina e o processo sai com 0', { timeout: 30_000 }, async () => {
    const url = inject('urlRedisDeTeste');
    const prefixo = `teste${randomUUID().slice(-12)}`;
    const processo = fork(FIXTURA, {
      env: {
        NODE_ENV: 'test',
        APP_ENV: 'local',
        URL_REDIS: url,
        URL_BANCO_WORKER: 'postgres://cardapio_worker:x@127.0.0.1:1/cardapio',
        PREFIXO_FILAS: prefixo,
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const pronto = esperarMensagem(processo, 'pronto');
    const iniciado = esperarMensagem(processo, 'job-iniciado');
    const redis = criarRedis(url, relatorMudo, { maxRetriesPerRequest: null });
    const fila = criarFila('rotinas', { conexao: redis, relator: relatorMudo, prefixo });

    await pronto;
    await fila.add('expirar-sessoes-mesa', {}, { jobId: 'job-lento' });
    await iniciado;
    processo.kill('SIGTERM');
    const [codigo] = (await once(processo, 'exit')) as unknown[];
    const job = await fila.getJob('job-lento');

    expect(codigo).toBe(0);
    expect(await job?.getState()).toBe('completed');
    expect(job?.returnvalue).toEqual({ lento: true });
    await fila.obliterate({ force: true });
    await fila.close();
    await fecharRedis(redis);
  });
});
