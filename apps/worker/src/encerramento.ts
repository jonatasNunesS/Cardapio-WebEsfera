import { obterLoggerPadrao } from '@cardapio/observabilidade/node';
import type { ProcessoWorker } from './processo.ts';

export function instalarEncerramento(
  worker: ProcessoWorker,
  sair = (codigo: number) => process.exit(codigo),
) {
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sinal, () => {
      obterLoggerPadrao().info({ sinal }, 'worker encerrando');
      void worker.encerrar().then(() => {
        obterLoggerPadrao().info('worker encerrado');
        sair(0);
      });
    });
  }
}
