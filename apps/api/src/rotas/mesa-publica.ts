import { abrirSessaoDeMesa, type DependenciasDaSessaoDeMesa } from '@cardapio/aplicacao';
import {
  COOKIE_DA_SESSAO_DE_MESA,
  esquemaCodigoNoLink,
  esquemaLinkDaMesa,
  rotaCom,
  ROTAS_DA_MESA_PUBLICA as ROTAS,
  type RespostaSessaoDeMesa,
} from '@cardapio/contratos';
import type { FastifyInstance } from 'fastify';
import { OPCOES_DE_COOKIE } from '../http/cookies.ts';
import { mascararIp } from '../http/ip.ts';
import { valorDaSessaoDeMesa } from '../http/sessao-de-mesa.ts';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { apenasNoHost } from '../identidade/sessao.ts';

export function registrarMesaPublica(
  servidor: FastifyInstance,
  dependencias: DependenciasDaSessaoDeMesa,
  host: string,
): void {
  void servidor.register((publico, _opcoes, pronto) => {
    publico.addHook('onRequest', apenasNoHost(host));
    publico.get(ROTAS.abrir, { config: { rateLimit: LIMITES.abrirMesa } }, async (requisicao, resposta) => {
      const { slug, numero } = esquemaLinkDaMesa.parse(requisicao.params);
      const { c: codigo } = esquemaCodigoNoLink.parse(requisicao.query);
      const origem = mascararIp(requisicao.ip);
      const resultado = await abrirSessaoDeMesa(dependencias, { slug, numero, codigo, origem });
      requisicao.log.info(
        {
          evento: 'mesa.abrir',
          origem,
          desfecho: resultado.ok ? resultado.valor.tipo : resultado.erro.codigo,
        },
        'tentativa de abrir mesa',
      );
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      const mesa = resultado.valor;
      if (mesa.tipo === 'redirecionar') {
        const rota = rotaCom(ROTAS.abrir, { slug: mesa.slug, numero: String(mesa.numero) });
        return resposta.redirect(`${rota}?c=${encodeURIComponent(mesa.codigo)}`, 301);
      }
      resposta.setCookie(COOKIE_DA_SESSAO_DE_MESA, valorDaSessaoDeMesa(mesa.restauranteId, mesa.sessaoId), {
        ...OPCOES_DE_COOKIE,
        expires: mesa.expiraEm,
        signed: true,
      });
      const corpo: RespostaSessaoDeMesa = {
        slug: mesa.slug,
        numero: mesa.numero,
        expiraEm: mesa.expiraEm.toISOString(),
      };
      return resposta.header('cache-control', 'no-store').send(corpo);
    });
    pronto();
  });
}
