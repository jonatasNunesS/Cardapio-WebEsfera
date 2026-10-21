import { carregarAmbiente } from '@cardapio/config';
import { instalarTratadoresDeFalha, obterLoggerPadrao } from '@cardapio/observabilidade/node';
import { esquemaAmbienteWorker } from './ambiente.ts';
import { comporWorker } from './composicao/index.ts';

instalarTratadoresDeFalha();
carregarAmbiente(esquemaAmbienteWorker);
const worker = comporWorker();

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sinal, () => {
    obterLoggerPadrao().info({ sinal }, 'worker encerrando');
    worker.encerrar();
  });
}

worker.iniciar();
obterLoggerPadrao().info('worker pronto');
process.send?.({ situacao: 'pronto' });
