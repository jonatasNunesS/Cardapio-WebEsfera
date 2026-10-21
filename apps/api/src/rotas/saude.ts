import type { FastifyInstance } from 'fastify';

export interface RespostaSaude {
  readonly situacao: 'ok';
}

export interface RespostaProntidao {
  readonly situacao: 'pronto';
}

export type VerificarProntidao = () => Promise<void>;

export function registrarRotaSaude(servidor: FastifyInstance, verificarProntidao: VerificarProntidao): void {
  servidor.get('/saude', (): RespostaSaude => ({ situacao: 'ok' }));
  servidor.get('/saude/pronto', async (): Promise<RespostaProntidao> => {
    await verificarProntidao();
    return { situacao: 'pronto' };
  });
}
