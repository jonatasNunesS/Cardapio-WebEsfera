import type { AssinanteTempoReal, DependenciasDaEquipe } from '@cardapio/aplicacao';
import type { FastifyInstance } from 'fastify';
import type { DependenciasDeIdentidade, HostsDosApps } from '../identidade/dependencias.ts';
import { apenasNoHost } from '../identidade/sessao.ts';
import { registrarFilaNoPainel } from './rotas-da-fila.ts';
import { registrarTempoRealDaMesa } from './tempo-real-da-mesa.ts';

export interface OpcoesDoIntermediario {
  readonly equipe: DependenciasDaEquipe;
  readonly assinante: AssinanteTempoReal;
  readonly hostPublico: string;
}

export function registrarIntermediario(
  escopo: FastifyInstance,
  identidade: DependenciasDeIdentidade,
  hosts: HostsDosApps,
  opcoes: OpcoesDoIntermediario,
): void {
  void escopo.register((painel, _opcoes, pronto) => {
    painel.addHook('onRequest', apenasNoHost(hosts.painel));
    registrarFilaNoPainel(painel, identidade, opcoes.equipe, opcoes.assinante);
    pronto();
  });
  registrarTempoRealDaMesa(escopo, opcoes.assinante, opcoes.hostPublico);
}
