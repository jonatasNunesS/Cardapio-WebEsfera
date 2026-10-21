import type { FastifyInstance } from 'fastify';

export interface RespostaSaude {
  readonly situacao: 'ok';
}

export function registrarRotaSaude(servidor: FastifyInstance): void {
  servidor.get('/saude', (): RespostaSaude => ({ situacao: 'ok' }));
}
