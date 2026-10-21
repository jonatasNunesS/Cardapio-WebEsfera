import { carregarAmbiente } from '@cardapio/config';
import { instalarTratadoresDeFalha, obterLoggerPadrao } from '@cardapio/observabilidade/node';
import { esquemaAmbienteWorker } from './ambiente.ts';
import { comporWorker } from './composicao/index.ts';

instalarTratadoresDeFalha();
const worker = comporWorker(carregarAmbiente(esquemaAmbienteWorker));

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sinal, () => {
    obterLoggerPadrao().info({ sinal }, 'worker encerrando');
    void worker.encerrar();
  });
}

worker.iniciar();
obterLoggerPadrao().info('worker pronto');
process.send?.({ situacao: 'pronto' });
