import { criarProcessoWorker, type ProcessoWorker } from '../processo.ts';

export function comporWorker(): ProcessoWorker {
  return criarProcessoWorker();
}
