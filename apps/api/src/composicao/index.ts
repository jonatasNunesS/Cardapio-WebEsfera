import type { FastifyInstance } from 'fastify';
import type { AmbienteApi } from '../ambiente.ts';
import { construirServidor } from '../servidor.ts';

export function comporApi(ambiente: AmbienteApi): FastifyInstance {
  return construirServidor({ registrarLogs: ambiente.NODE_ENV !== 'test' });
}
