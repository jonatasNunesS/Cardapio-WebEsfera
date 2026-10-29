import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import { CABECALHO_CSRF } from '@cardapio/contratos';
import type {
  DependenciasDaMidia,
  DependenciasDoCardapio,
  DependenciasDoCardapioPublico,
} from '@cardapio/aplicacao';
import type { FastifyInstance } from 'fastify';
import { COOKIES, OPCOES_DE_COOKIE } from '../http/cookies.ts';
import { apenasNoHost } from './sessao.ts';
import { registrarRotasDoAdmin } from '../rotas/admin.ts';
import { registrarCardapioNoPainel } from '../rotas/cardapio-painel.ts';
import { registrarCardapioPublico } from '../rotas/cardapio-publico.ts';
import { registrarMidiaNoPainel } from '../rotas/midia-painel.ts';
import { registrarPainelDeFilas, type OpcoesDoPainelDeFilas } from '../rotas/filas.ts';
import { registrarRotasDoPainel } from '../rotas/painel.ts';
import type { DependenciasDeIdentidade, HostsDosApps } from './dependencias.ts';

export interface OpcoesDeIdentidade {
  readonly dependencias: DependenciasDeIdentidade;
  readonly hosts: HostsDosApps;
  readonly armazenamentoDeLimites?: RateLimitPluginOptions['redis'];
  readonly painelDeFilas?: Pick<OpcoesDoPainelDeFilas, 'adaptadores' | 'aoFalhar'>;
  readonly cardapio?: OpcoesDoCardapio;
}

export interface OpcoesDoCardapio {
  readonly dependencias: DependenciasDoCardapio & DependenciasDoCardapioPublico;
  readonly midia?: DependenciasDaMidia;
  readonly hostPublico: string;
}

function registrarCardapio(
  escopo: FastifyInstance,
  opcoes: OpcoesDeIdentidade,
  cardapio: OpcoesDoCardapio,
): void {
  void escopo.register((painel, _opcoes, pronto) => {
    painel.addHook('onRequest', apenasNoHost(opcoes.hosts.painel));
    registrarCardapioNoPainel(painel, opcoes.dependencias, cardapio.dependencias);
    if (cardapio.midia !== undefined) {
      registrarMidiaNoPainel(painel, opcoes.dependencias, cardapio.midia);
    }
    pronto();
  });
  registrarCardapioPublico(escopo, cardapio.dependencias, cardapio.hostPublico);
}

export function registrarIdentidade(servidor: FastifyInstance, opcoes: OpcoesDeIdentidade): void {
  void servidor.register(async (escopo) => {
    escopo.decorateRequest('sessaoValida', null);
    await escopo.register(cookie);
    await escopo.register(csrf, {
      cookieKey: COOKIES.csrf,
      cookieOpts: OPCOES_DE_COOKIE,
      getToken: (requisicao) => {
        const valor = requisicao.headers[CABECALHO_CSRF];
        return typeof valor === 'string' ? valor : undefined;
      },
    });
    await escopo.register(rateLimit, {
      global: false,
      nameSpace: 'limite:api:',
      skipOnError: true,
      ...(opcoes.armazenamentoDeLimites === undefined ? {} : { redis: opcoes.armazenamentoDeLimites }),
    });
    registrarRotasDoPainel(escopo, opcoes.dependencias, opcoes.hosts.painel);
    registrarRotasDoAdmin(escopo, opcoes.dependencias, opcoes.hosts.admin);
    if (opcoes.cardapio !== undefined) {
      registrarCardapio(escopo, opcoes, opcoes.cardapio);
    }
    if (opcoes.painelDeFilas !== undefined) {
      registrarPainelDeFilas(escopo, {
        ...opcoes.painelDeFilas,
        dependencias: opcoes.dependencias,
        host: opcoes.hosts.admin,
      });
    }
  });
}
