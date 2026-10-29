import { armazenamentoDoAmbiente, criarBanco, criarRedis } from '@cardapio/infraestrutura';
import {
  criarLogger,
  definirLoggerPadrao,
  propagadorDeContexto,
  relatorDeErrosSentry,
} from '@cardapio/observabilidade/node';
import type { FastifyInstance } from 'fastify';
import type { AmbienteApi } from '../ambiente.ts';
import { construirServidor } from '../servidor.ts';
import { comporCardapio } from './cardapio.ts';
import { comporPainelDeFilas } from './filas.ts';
import { comporIdentidade } from './identidade.ts';
import { comporMesas } from './mesas.ts';
import { comporMidia } from './midia.ts';

export function comporApi(ambiente: AmbienteApi): FastifyInstance {
  const logger = criarLogger({ app: 'api', nivel: ambiente.NODE_ENV === 'test' ? 'silent' : 'info' });
  definirLoggerPadrao(logger);
  const banco = criarBanco({
    runtime: { url: ambiente.URL_BANCO_API, nomeAplicacao: 'cardapio-api' },
    propagador: propagadorDeContexto,
    relator: relatorDeErrosSentry,
  });
  const redis = criarRedis(ambiente.URL_REDIS, relatorDeErrosSentry);
  const painelDeFilas = comporPainelDeFilas(ambiente.URL_REDIS, relatorDeErrosSentry);
  const armazenamento = armazenamentoDoAmbiente(ambiente);
  const servidor = construirServidor({
    logger,
    ambiente: ambiente.APP_ENV,
    relatorDeErros: relatorDeErrosSentry,
    verificarProntidao: () => banco.verificarConexao(),
    ...(ambiente.PROXIES_CONFIAVEIS === undefined || ambiente.PROXIES_CONFIAVEIS === ''
      ? {}
      : { proxiesConfiaveis: ambiente.PROXIES_CONFIAVEIS }),
    identidade: {
      dependencias: comporIdentidade(ambiente, banco, logger),
      hosts: { painel: ambiente.DOMINIO_PAINEL, admin: ambiente.DOMINIO_ADMIN },
      armazenamentoDeLimites: redis,
      painelDeFilas: painelDeFilas.opcoes,
      cardapio: {
        dependencias: comporCardapio(banco, redis, armazenamento),
        midia: comporMidia(banco, armazenamento),
        hostPublico: ambiente.DOMINIO_CARDAPIO,
      },
      mesas: comporMesas(ambiente, banco, redis, relatorDeErrosSentry),
    },
  });
  servidor.addHook('onClose', async () => {
    redis.disconnect();
    armazenamento.encerrar();
    await painelDeFilas.encerrar();
    await banco.encerrar();
  });
  return servidor;
}
