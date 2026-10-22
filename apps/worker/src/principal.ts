import { carregarAmbiente } from '@cardapio/config';
import { instalarTratadoresDeFalha, obterLoggerPadrao } from '@cardapio/observabilidade/node';
import { esquemaAmbienteWorker } from './ambiente.ts';
import { comporWorker } from './composicao/index.ts';
import { instalarEncerramento } from './encerramento.ts';

instalarTratadoresDeFalha();
const worker = comporWorker(carregarAmbiente(esquemaAmbienteWorker));
instalarEncerramento(worker);
worker.iniciar();
obterLoggerPadrao().info('worker pronto');
process.send?.({ situacao: 'pronto' });
