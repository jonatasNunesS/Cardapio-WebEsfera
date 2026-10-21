import { criarBanco } from '@cardapio/infraestrutura';
import {
  criarLogger,
  definirLoggerPadrao,
  propagadorDeContexto,
  relatorDeErrosSentry,
} from '@cardapio/observabilidade/node';
import type { FastifyInstance } from 'fastify';
import type { AmbienteApi } from '../ambiente.ts';
import { construirServidor } from '../servidor.ts';

export function comporApi(ambiente: AmbienteApi): FastifyInstance {
  const logger = criarLogger({ app: 'api', nivel: ambiente.NODE_ENV === 'test' ? 'silent' : 'info' });
  definirLoggerPadrao(logger);
  const banco = criarBanco({
    runtime: { url: ambiente.URL_BANCO_API, nomeAplicacao: 'cardapio-api' },
    propagador: propagadorDeContexto,
    relator: relatorDeErrosSentry,
  });
  const servidor = construirServidor({
    logger,
    ambiente: ambiente.APP_ENV,
    relatorDeErros: relatorDeErrosSentry,
    verificarProntidao: () => banco.verificarConexao(),
  });
  servidor.addHook('onClose', () => banco.encerrar());
  return servidor;
}
