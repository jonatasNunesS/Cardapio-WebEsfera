import { carregarAmbiente } from '@cardapio/config';
import { esquemaAmbienteWorker } from './ambiente.ts';
import { comporWorker } from './composicao/index.ts';

carregarAmbiente(esquemaAmbienteWorker);
const worker = comporWorker();

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sinal, () => {
    worker.encerrar();
  });
}

worker.iniciar();
process.send?.({ situacao: 'pronto' });
