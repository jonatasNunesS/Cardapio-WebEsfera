import { listarMesasParaOAdmin, type DependenciasDoAdminDeMesas } from '@cardapio/aplicacao';
import {
  esquemaSlugDoAdmin,
  ROTAS_DAS_MESAS_NO_ADMIN as ROTAS,
  type RespostaMesasNoAdmin,
} from '@cardapio/contratos';
import type { FastifyInstance } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { exigirSessao, sessaoDa } from '../identidade/sessao.ts';

export function registrarMesasNoAdmin(
  admin: FastifyInstance,
  identidade: DependenciasDeIdentidade,
  dependencias: DependenciasDoAdminDeMesas,
): void {
  admin.get(
    ROTAS.mesas,
    { preHandler: exigirSessao(identidade, 'admin', ['completa']) },
    async (requisicao, resposta) => {
      const { slug } = esquemaSlugDoAdmin.parse(requisicao.params);
      const resultado = await listarMesasParaOAdmin(dependencias, sessaoDa(requisicao).titularId, slug);
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      const corpo: RespostaMesasNoAdmin = {
        nomeDoRestaurante: resultado.valor.nomeDoRestaurante,
        slug: resultado.valor.slug,
        mesas: resultado.valor.mesas.map((mesa) => ({
          numero: mesa.numero,
          nome: mesa.nome,
          area: mesa.area,
          ativa: mesa.ativa,
          link: mesa.link,
        })),
      };
      return resposta.header('cache-control', 'private, no-store').send(corpo);
    },
  );
}
