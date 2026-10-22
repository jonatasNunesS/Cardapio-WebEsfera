import type { RelatorDeErros } from '@cardapio/aplicacao';
import type { AmbienteApp } from '@cardapio/observabilidade/node';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { ControladorDeLog } from './http/controlador-de-log.ts';
import { idRastreioDaRequisicao, registrarRastreio } from './http/rastreio.ts';
import { registrarTratadorDeErros } from './http/tratador-de-erros.ts';
import { registrarIdentidade, type OpcoesDeIdentidade } from './identidade/registrar.ts';
import { registrarRotaDeDepuracao } from './rotas/depuracao.ts';
import { registrarRotaSaude, type VerificarProntidao } from './rotas/saude.ts';

export interface OpcoesServidor {
  readonly logger: FastifyBaseLogger;
  readonly ambiente: AmbienteApp;
  readonly relatorDeErros: RelatorDeErros;
  readonly verificarProntidao: VerificarProntidao;
  readonly identidade?: OpcoesDeIdentidade;
  readonly proxiesConfiaveis?: string;
}

export function construirServidor(opcoes: OpcoesServidor): FastifyInstance {
  const servidor = Fastify({
    loggerInstance: opcoes.logger,
    genReqId: idRastreioDaRequisicao,
    requestIdHeader: false,
    logController: new ControladorDeLog(),
    trustProxy: opcoes.proxiesConfiaveis ?? false,
  });
  registrarRastreio(servidor);
  registrarTratadorDeErros(servidor, opcoes.relatorDeErros);
  registrarRotaSaude(servidor, opcoes.verificarProntidao);
  if (opcoes.identidade !== undefined) {
    registrarIdentidade(servidor, opcoes.identidade);
  }
  if (opcoes.ambiente === 'local' || opcoes.ambiente === 'preview') {
    registrarRotaDeDepuracao(servidor);
  }
  return servidor;
}
