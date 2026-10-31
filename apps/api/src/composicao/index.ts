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
import { comporCobranca } from './cobranca.ts';
import { comporPainelDeFilas } from './filas.ts';
import { comporIdentidade } from './identidade.ts';
import { comporMesas } from './mesas.ts';
import { comporIntermediario } from './intermediario.ts';
import { comporMidia } from './midia.ts';

export interface OpcoesDaComposicao {
  readonly destinoDoLog?: Parameters<typeof criarLogger>[0]['destino'];
}

export function comporApi(ambiente: AmbienteApi, opcoes: OpcoesDaComposicao = {}): FastifyInstance {
  const logger = criarLogger({
    app: 'api',
    nivel: ambiente.NODE_ENV === 'test' && opcoes.destinoDoLog === undefined ? 'silent' : 'info',
    ...(opcoes.destinoDoLog === undefined ? {} : { destino: opcoes.destinoDoLog }),
  });
  definirLoggerPadrao(logger);
  const banco = criarBanco({
    runtime: { url: ambiente.URL_BANCO_API, nomeAplicacao: 'cardapio-api' },
    propagador: propagadorDeContexto,
    relator: relatorDeErrosSentry,
  });
  const redis = criarRedis(ambiente.URL_REDIS, relatorDeErrosSentry);
  const painelDeFilas = comporPainelDeFilas(ambiente.URL_REDIS, relatorDeErrosSentry);
  const armazenamento = armazenamentoDoAmbiente(ambiente);
  const cobranca = comporCobranca(ambiente, banco, redis, relatorDeErrosSentry);
  const identidade = comporIdentidade(ambiente, banco, logger);
  const intermediario = comporIntermediario(ambiente, banco, identidade, relatorDeErrosSentry);
  const servidor = construirServidor({
    logger,
    ambiente: ambiente.APP_ENV,
    relatorDeErros: relatorDeErrosSentry,
    verificarProntidao: () => banco.verificarConexao(),
    ...(ambiente.PROXIES_CONFIAVEIS === undefined || ambiente.PROXIES_CONFIAVEIS === ''
      ? {}
      : { proxiesConfiaveis: ambiente.PROXIES_CONFIAVEIS }),
    identidade: {
      dependencias: identidade,
      hosts: { painel: ambiente.DOMINIO_PAINEL, admin: ambiente.DOMINIO_ADMIN },
      armazenamentoDeLimites: redis,
      painelDeFilas: painelDeFilas.opcoes,
      cardapio: {
        dependencias: comporCardapio(banco, redis, armazenamento),
        midia: comporMidia(banco, armazenamento),
        hostPublico: ambiente.DOMINIO_CARDAPIO,
      },
      mesas: comporMesas(ambiente, banco, redis, relatorDeErrosSentry),
      cobranca: cobranca.opcoes,
      intermediario,
    },
  });
  servidor.addHook('onClose', async () => {
    redis.disconnect();
    armazenamento.encerrar();
    await cobranca.encerrar();
    await intermediario.assinante.encerrar();
    await painelDeFilas.encerrar();
    await banco.encerrar();
  });
  return servidor;
}
