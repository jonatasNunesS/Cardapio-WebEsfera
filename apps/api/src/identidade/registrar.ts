import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import { CABECALHO_CSRF } from '@cardapio/contratos';
import type { FastifyInstance } from 'fastify';
import { COOKIES, OPCOES_DE_COOKIE } from '../http/cookies.ts';
import { registrarRotasDoAdmin } from '../rotas/admin.ts';
import { registrarRotasDoPainel } from '../rotas/painel.ts';
import type { DependenciasDeIdentidade, HostsDosApps } from './dependencias.ts';

export interface OpcoesDeIdentidade {
  readonly dependencias: DependenciasDeIdentidade;
  readonly hosts: HostsDosApps;
  readonly armazenamentoDeLimites?: RateLimitPluginOptions['redis'];
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
  });
}
