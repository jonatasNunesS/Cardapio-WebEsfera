import Fastify, { type FastifyInstance } from 'fastify';
import { registrarRotaSaude } from './rotas/saude.ts';

export interface OpcoesServidor {
  readonly registrarLogs: boolean;
}

export function construirServidor(opcoes: OpcoesServidor): FastifyInstance {
  const servidor = Fastify({ logger: opcoes.registrarLogs });
  registrarRotaSaude(servidor);
  return servidor;
}
