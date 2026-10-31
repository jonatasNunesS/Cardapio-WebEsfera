import type { AssinanteTempoReal } from '@cardapio/aplicacao';
import { EVENTOS_DA_MESA_NO_TEMPO_REAL, ROTAS_DO_TEMPO_REAL } from '@cardapio/contratos/publico';
import type { FastifyInstance } from 'fastify';
import { comSessaoDeMesa } from '../http/sessao-de-mesa.ts';
import { LIMITES } from '../identidade/limites.ts';
import { apenasNoHost } from '../identidade/sessao.ts';
import { abrirFluxoSse } from './fluxo-sse.ts';

const TIPOS_DA_MESA: ReadonlySet<string> = new Set(EVENTOS_DA_MESA_NO_TEMPO_REAL);

export function registrarTempoRealDaMesa(
  servidor: FastifyInstance,
  assinante: AssinanteTempoReal,
  host: string,
): void {
  void servidor.register((publico, _opcoes, pronto) => {
    publico.addHook('onRequest', apenasNoHost(host));
    publico.get(
      ROTAS_DO_TEMPO_REAL.mesa,
      { config: { rateLimit: LIMITES.consultarPedido } },
      (requisicao, resposta) =>
        comSessaoDeMesa(requisicao, resposta, async (sessao) => {
          await abrirFluxoSse(requisicao, resposta, {
            assinante,
            restauranteId: sessao.restauranteId,
            filtrar: (aviso) =>
              TIPOS_DA_MESA.has(aviso.tipo) && aviso.dados.sessaoMesaId === sessao.sessaoMesaId ? {} : null,
          });
          return resposta;
        }),
    );
    pronto();
  });
}
