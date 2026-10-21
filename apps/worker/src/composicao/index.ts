import { criarLogger, definirLoggerPadrao } from '@cardapio/observabilidade/node';
import { criarProcessoWorker, type ProcessoWorker } from '../processo.ts';

export function comporWorker(): ProcessoWorker {
  definirLoggerPadrao(criarLogger({ app: 'worker' }));
  return criarProcessoWorker();
}
