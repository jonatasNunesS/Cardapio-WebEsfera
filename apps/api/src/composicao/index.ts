import { criarLogger, definirLoggerPadrao, relatorDeErrosSentry } from '@cardapio/observabilidade/node';
import type { FastifyInstance } from 'fastify';
import type { AmbienteApi } from '../ambiente.ts';
import { construirServidor } from '../servidor.ts';

export function comporApi(ambiente: AmbienteApi): FastifyInstance {
  const logger = criarLogger({ app: 'api', nivel: ambiente.NODE_ENV === 'test' ? 'silent' : 'info' });
  definirLoggerPadrao(logger);
  return construirServidor({ logger, ambiente: ambiente.APP_ENV, relatorDeErros: relatorDeErrosSentry });
}
