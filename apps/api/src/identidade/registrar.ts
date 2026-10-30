import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import { CABECALHO_CSRF } from '@cardapio/contratos';
import type {
  DependenciasDosPedidos,
  DependenciasDaAssinatura,
  DependenciasDoAviso,
  DependenciasDaMidia,
  DependenciasDaSessaoDeMesa,
  DependenciasDasMesas,
  DependenciasDoAdminDeMesas,
  DependenciasDoCardapio,
  DependenciasDoCardapioPublico,
} from '@cardapio/aplicacao';
import type { FastifyInstance } from 'fastify';
import { COOKIES, OPCOES_DE_COOKIE } from '../http/cookies.ts';
import { apenasNoHost } from './sessao.ts';
import { registrarRotasDoAdmin } from '../rotas/admin.ts';
import { registrarAvisoDePagamento } from '../rotas/aviso-de-pagamento.ts';
import { registrarCobrancaNoPainel } from '../rotas/cobranca-painel.ts';
import { registrarCardapioNoPainel } from '../rotas/cardapio-painel.ts';
import { registrarCardapioPublico } from '../rotas/cardapio-publico.ts';
import { registrarMesaPublica } from '../rotas/mesa-publica.ts';
import { registrarPedidosDaMesa } from '../rotas/pedidos-mesa.ts';
import { registrarMesasNoAdmin } from '../rotas/mesas-admin.ts';
import { registrarMesasNoPainel } from '../rotas/mesas-painel.ts';
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
  readonly mesas?: OpcoesDasMesas;
  readonly cobranca?: OpcoesDaCobranca;
}

export interface OpcoesDaCobranca {
  readonly assinatura: DependenciasDaAssinatura;
  readonly aviso: DependenciasDoAviso;
}

export interface OpcoesDasMesas {
  readonly painel: DependenciasDasMesas;
  readonly sessao: DependenciasDaSessaoDeMesa;
  readonly admin: DependenciasDoAdminDeMesas;
  readonly hostPublico: string;
  readonly chaveDaSessaoDeMesa: string;
  readonly pedidos?: DependenciasDosPedidos;
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

function registrarMesas(escopo: FastifyInstance, opcoes: OpcoesDeIdentidade, mesas: OpcoesDasMesas): void {
  void escopo.register((painel, _opcoes, pronto) => {
    painel.addHook('onRequest', apenasNoHost(opcoes.hosts.painel));
    registrarMesasNoPainel(painel, opcoes.dependencias, mesas.painel);
    pronto();
  });
  void escopo.register((admin, _opcoes, pronto) => {
    admin.addHook('onRequest', apenasNoHost(opcoes.hosts.admin));
    registrarMesasNoAdmin(admin, opcoes.dependencias, mesas.admin);
    pronto();
  });
  registrarMesaPublica(escopo, mesas.sessao, mesas.hostPublico);
  if (mesas.pedidos !== undefined) {
    registrarPedidosDaMesa(escopo, mesas.pedidos, mesas.hostPublico);
  }
}

function registrarCobranca(
  escopo: FastifyInstance,
  opcoes: OpcoesDeIdentidade,
  cobranca: OpcoesDaCobranca,
): void {
  void escopo.register((painel, _opcoes, pronto) => {
    painel.addHook('onRequest', apenasNoHost(opcoes.hosts.painel));
    registrarCobrancaNoPainel(painel, opcoes.dependencias, cobranca.assinatura);
    pronto();
  });
  registrarAvisoDePagamento(escopo, cobranca.aviso, opcoes.hosts.painel);
}

export function registrarIdentidade(servidor: FastifyInstance, opcoes: OpcoesDeIdentidade): void {
  void servidor.register(async (escopo) => {
    escopo.decorateRequest('sessaoValida', null);
    await escopo.register(
      cookie,
      opcoes.mesas === undefined ? {} : { secret: opcoes.mesas.chaveDaSessaoDeMesa },
    );
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
    if (opcoes.mesas !== undefined) {
      registrarMesas(escopo, opcoes, opcoes.mesas);
    }
    if (opcoes.cobranca !== undefined) {
      registrarCobranca(escopo, opcoes, opcoes.cobranca);
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
