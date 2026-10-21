import type { RelatorDeErros } from '@cardapio/aplicacao';
import type { AmbienteApp } from '@cardapio/observabilidade/node';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { ControladorDeLog } from './http/controlador-de-log.ts';
import { gerarIdRastreio, registrarRastreio } from './http/rastreio.ts';
import { registrarTratadorDeErros } from './http/tratador-de-erros.ts';
import { registrarRotaDeDepuracao } from './rotas/depuracao.ts';
import { registrarRotaSaude } from './rotas/saude.ts';

export interface OpcoesServidor {
  readonly logger: FastifyBaseLogger;
  readonly ambiente: AmbienteApp;
  readonly relatorDeErros: RelatorDeErros;
}

export function construirServidor(opcoes: OpcoesServidor): FastifyInstance {
  const servidor = Fastify({
    loggerInstance: opcoes.logger,
    genReqId: gerarIdRastreio,
    requestIdHeader: false,
    logController: new ControladorDeLog(),
  });
  registrarRastreio(servidor);
  registrarTratadorDeErros(servidor, opcoes.relatorDeErros);
  registrarRotaSaude(servidor);
  if (opcoes.ambiente === 'local' || opcoes.ambiente === 'preview') {
    registrarRotaDeDepuracao(servidor);
  }
  return servidor;
}
