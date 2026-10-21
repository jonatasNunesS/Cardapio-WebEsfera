import { CODIGOS, ErroAplicacao } from '@cardapio/aplicacao';
import type { FastifyInstance } from 'fastify';

export function registrarRotaDeDepuracao(servidor: FastifyInstance): void {
  servidor.get('/depuracao/erro', () => {
    throw new ErroAplicacao(
      CODIGOS.DEPURACAO_ERRO_PROVOCADO,
      'Erro de teste provocado pela rota de depuração',
      {
        modulo: 'depuracao',
        casoDeUso: 'ProvocarErroDeTeste',
        entidade: 'depuracao',
        dados: { motivo: 'verificar a integração com o Sentry' },
      },
    );
  });
}
