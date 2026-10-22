import {
  confirmarRedefinicaoDeSenha,
  consultarPersonalizacao,
  consultarRestaurante,
  criarConta,
  criarRestaurante,
  definirHorarios,
  entrar,
  pedirRedefinicaoDeSenha,
  publicarPersonalizacao,
  sair,
} from '@cardapio/aplicacao';
import {
  esquemaConfirmarRedefinicao,
  esquemaCriarConta,
  esquemaCriarRestaurante,
  esquemaDefinirHorarios,
  esquemaEntrar,
  esquemaPedirRedefinicao,
  esquemaPublicarPersonalizacao,
  ROTAS_DO_PAINEL,
  type RespostaCsrf,
  type RespostaRestauranteCriado,
  type RespostaSessaoDoPainel,
} from '@cardapio/contratos';
import type { FastifyInstance } from 'fastify';
import { apagarCookieDeSessao, COOKIES, gravarCookieDeSessao } from '../http/cookies.ts';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { acessoDa, apenasNoHost, protegerCsrf, exigirSessao, sessaoDa } from '../identidade/sessao.ts';

export function registrarRotasDoPainel(
  servidor: FastifyInstance,
  dependencias: DependenciasDeIdentidade,
  host: string,
): void {
  void servidor.register((painel, _opcoes, pronto) => {
    painel.addHook('onRequest', apenasNoHost(host));
    registrarConta(painel, dependencias);
    registrarSessao(painel, dependencias);
    registrarRestaurante(painel, dependencias);
    pronto();
  });
}

function registrarConta(painel: FastifyInstance, dependencias: DependenciasDeIdentidade): void {
  painel.get(ROTAS_DO_PAINEL.csrf, (_requisicao, resposta): RespostaCsrf => ({
    token: resposta.generateCsrf(),
  }));

  painel.post(
    ROTAS_DO_PAINEL.contas,
    { onRequest: protegerCsrf(painel), config: { rateLimit: LIMITES.criarConta } },
    async (requisicao, resposta) => {
      const resultado = await criarConta(dependencias, esquemaCriarConta.parse(requisicao.body));
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      gravarCookieDeSessao(resposta, COOKIES.painel, resultado.valor);
      return resposta.code(201).send();
    },
  );

  painel.post(
    ROTAS_DO_PAINEL.pedidoDeRedefinicao,
    { onRequest: protegerCsrf(painel), config: { rateLimit: LIMITES.redefinirSenha } },
    async (requisicao, resposta) => {
      await pedirRedefinicaoDeSenha(dependencias, esquemaPedirRedefinicao.parse(requisicao.body).email);
      return resposta.code(202).send();
    },
  );

  painel.post(
    ROTAS_DO_PAINEL.confirmacaoDeRedefinicao,
    { onRequest: protegerCsrf(painel), config: { rateLimit: LIMITES.redefinirSenha } },
    async (requisicao, resposta) => {
      const resultado = await confirmarRedefinicaoDeSenha(
        dependencias,
        esquemaConfirmarRedefinicao.parse(requisicao.body),
      );
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      apagarCookieDeSessao(resposta, COOKIES.painel);
      return resposta.code(204).send();
    },
  );
}

function registrarSessao(painel: FastifyInstance, dependencias: DependenciasDeIdentidade): void {
  painel.post(
    ROTAS_DO_PAINEL.sessao,
    { onRequest: protegerCsrf(painel), config: { rateLimit: LIMITES.entrar } },
    async (requisicao, resposta) => {
      const corpo = esquemaEntrar.parse(requisicao.body);
      const resultado = await entrar(dependencias, { ...corpo, ip: requisicao.ip });
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      gravarCookieDeSessao(resposta, COOKIES.painel, resultado.valor);
      return resposta.code(204).send();
    },
  );

  painel.get(
    ROTAS_DO_PAINEL.sessao,
    { preHandler: exigirSessao(dependencias, 'painel', ['completa']) },
    async (requisicao): Promise<RespostaSessaoDoPainel> => {
      const sessao = sessaoDa(requisicao);
      if (sessao.restauranteId === null || sessao.papel === null) {
        return { restaurante: null };
      }
      const resumo = await consultarRestaurante(dependencias, {
        restauranteId: sessao.restauranteId,
        papel: sessao.papel,
      });
      return {
        restaurante:
          resumo === null
            ? null
            : {
                ...resumo,
                testeTerminaEm: resumo.testeTerminaEm?.toISOString() ?? null,
                papel: sessao.papel,
              },
      };
    },
  );

  painel.delete(ROTAS_DO_PAINEL.sessao, { onRequest: protegerCsrf(painel) }, async (requisicao, resposta) => {
    const token = requisicao.cookies[COOKIES.painel];
    if (token !== undefined && token !== '') {
      await sair(dependencias, token);
    }
    apagarCookieDeSessao(resposta, COOKIES.painel);
    return resposta.code(204).send();
  });
}

function registrarRestaurante(painel: FastifyInstance, dependencias: DependenciasDeIdentidade): void {
  const comSessao = exigirSessao(dependencias, 'painel', ['completa']);

  painel.post(
    ROTAS_DO_PAINEL.restaurante,
    { onRequest: protegerCsrf(painel), preHandler: comSessao },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const resultado = await criarRestaurante(dependencias, {
        usuarioId: sessao.titularId,
        hashDaSessao: sessao.hashId,
        nome: esquemaCriarRestaurante.parse(requisicao.body).nome,
      });
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      const corpo: RespostaRestauranteCriado = { slug: resultado.valor.slug };
      return resposta.code(201).send(corpo);
    },
  );

  painel.get(ROTAS_DO_PAINEL.personalizacao, { preHandler: comSessao }, async (requisicao, resposta) => {
    const acesso = acessoDa(requisicao, resposta);
    return acesso === null ? resposta : consultarPersonalizacao(dependencias, acesso);
  });

  painel.put(
    ROTAS_DO_PAINEL.personalizacao,
    { onRequest: protegerCsrf(painel), preHandler: comSessao },
    async (requisicao, resposta) => {
      const acesso = acessoDa(requisicao, resposta);
      if (acesso === null) {
        return resposta;
      }
      const corpo = esquemaPublicarPersonalizacao.parse(requisicao.body);
      const resultado = await publicarPersonalizacao(dependencias, acesso, corpo);
      return resultado.ok
        ? resultado.valor
        : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
    },
  );

  painel.put(
    ROTAS_DO_PAINEL.horarios,
    { onRequest: protegerCsrf(painel), preHandler: comSessao },
    async (requisicao, resposta) => {
      const acesso = acessoDa(requisicao, resposta);
      if (acesso === null) {
        return resposta;
      }
      const { horarios } = esquemaDefinirHorarios.parse(requisicao.body);
      const resultado = await definirHorarios(dependencias, acesso, horarios);
      return resultado.ok
        ? { horarios: resultado.valor }
        : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
    },
  );
}
