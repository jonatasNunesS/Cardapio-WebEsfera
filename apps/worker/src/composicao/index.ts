import { criarBanco } from '@cardapio/infraestrutura';
import {
  criarLogger,
  definirLoggerPadrao,
  propagadorDeContexto,
  relatorDeErrosSentry,
} from '@cardapio/observabilidade/node';
import type { AmbienteWorker } from '../ambiente.ts';
import { criarProcessoWorker, type ProcessoWorker } from '../processo.ts';

export function comporWorker(ambiente: AmbienteWorker): ProcessoWorker {
  definirLoggerPadrao(criarLogger({ app: 'worker' }));
  const banco = criarBanco({
    runtime: { url: ambiente.URL_BANCO_WORKER, nomeAplicacao: 'cardapio-worker' },
    sistema: { url: ambiente.URL_BANCO_WORKER, nomeAplicacao: 'cardapio-worker-sistema', maxConexoes: 2 },
    propagador: propagadorDeContexto,
    relator: relatorDeErrosSentry,
  });
  return criarProcessoWorker({ aoEncerrar: () => banco.encerrar() });
}
