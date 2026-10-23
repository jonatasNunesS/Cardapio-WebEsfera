import {
  buscarPratos,
  obterCardapioPublicado,
  type CardapioParaOCliente,
  type DependenciasDoCardapioPublico,
} from '@cardapio/aplicacao';
import {
  esquemaSlugPublico,
  esquemaTermoDeBusca,
  rotaCom,
  ROTAS_DO_CARDAPIO_PUBLICO as ROTAS,
  type RespostaBuscaPublica,
  type RespostaCardapioPublico,
} from '@cardapio/contratos';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { apenasNoHost } from '../identidade/sessao.ts';

const CACHE_PUBLICO = 'public, max-age=30, stale-while-revalidate=60';

function paraResposta(valor: Extract<CardapioParaOCliente, { tipo: 'cardapio' }>): RespostaCardapioPublico {
  const { cardapio } = valor;
  return {
    restaurante: { nome: cardapio.restaurante.nome, slug: cardapio.restaurante.slug },
    personalizacao: cardapio.personalizacao,
    aberto: valor.aberto,
    proximaAbertura: valor.proximaAbertura,
    secoes: cardapio.secoes,
    destaques: cardapio.destaques,
    versao: cardapio.versao,
  };
}

function redirecionar(resposta: FastifyReply, rota: string, slug: string, consulta = ''): FastifyReply {
  return resposta.redirect(`${rotaCom(rota, { slug })}${consulta}`, 301);
}

export function registrarCardapioPublico(
  servidor: FastifyInstance,
  dependencias: DependenciasDoCardapioPublico,
  host: string,
): void {
  void servidor.register((publico, _opcoes, pronto) => {
    publico.addHook('onRequest', apenasNoHost(host));
    publico.get(
      ROTAS.cardapio,
      { config: { rateLimit: LIMITES.cardapioPublico } },
      async (requisicao, resposta) => {
        const { slug } = esquemaSlugPublico.parse(requisicao.params);
        const resultado = await obterCardapioPublicado(dependencias, slug);
        if (!resultado.ok) {
          return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
        }
        if (resultado.valor.tipo === 'redirecionar') {
          return redirecionar(resposta, ROTAS.cardapio, resultado.valor.slug);
        }
        return resposta.header('cache-control', CACHE_PUBLICO).send(paraResposta(resultado.valor));
      },
    );
    publico.get(
      ROTAS.busca,
      { config: { rateLimit: LIMITES.buscaPublica } },
      async (requisicao, resposta) => {
        const { slug } = esquemaSlugPublico.parse(requisicao.params);
        const { termo } = esquemaTermoDeBusca.parse(requisicao.query);
        const resultado = await buscarPratos(dependencias, slug, termo);
        if (!resultado.ok) {
          return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
        }
        if (resultado.valor.tipo === 'redirecionar') {
          return redirecionar(
            resposta,
            ROTAS.busca,
            resultado.valor.slug,
            `?termo=${encodeURIComponent(termo)}`,
          );
        }
        const corpo: RespostaBuscaPublica = { termo, resultados: resultado.valor.pratos };
        return resposta.header('cache-control', CACHE_PUBLICO).send(corpo);
      },
    );
    pronto();
  });
}
