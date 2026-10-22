import {
  concluirCadastroSegundoFatorAdmin,
  confirmarSegundoFatorAdmin,
  entrarComoAdmin,
  iniciarCadastroSegundoFatorAdmin,
  sair,
} from '@cardapio/aplicacao';
import {
  esquemaConcluirCadastroDoSegundoFator,
  esquemaConfirmarSegundoFator,
  esquemaEntrarComoAdmin,
  ROTAS_DO_ADMIN,
  type RespostaCadastroConcluido,
  type RespostaCadastroIniciado,
  type RespostaCsrf,
  type RespostaEntradaDoAdmin,
} from '@cardapio/contratos';
import type { FastifyInstance } from 'fastify';
import { apagarCookieDeSessao, COOKIES, gravarCookieDeSessao } from '../http/cookies.ts';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { apenasNoHost, protegerCsrf, exigirSessao, sessaoDa } from '../identidade/sessao.ts';

export function registrarRotasDoAdmin(
  servidor: FastifyInstance,
  dependencias: DependenciasDeIdentidade,
  host: string,
): void {
  void servidor.register((admin, _opcoes, pronto) => {
    admin.addHook('onRequest', apenasNoHost(host));
    registrarEntrada(admin, dependencias);
    registrarCadastro(admin, dependencias);
    pronto();
  });
}

function registrarEntrada(admin: FastifyInstance, dependencias: DependenciasDeIdentidade): void {
  admin.get(ROTAS_DO_ADMIN.csrf, (_requisicao, resposta): RespostaCsrf => ({
    token: resposta.generateCsrf(),
  }));

  admin.post(
    ROTAS_DO_ADMIN.sessao,
    { onRequest: protegerCsrf(admin), config: { rateLimit: LIMITES.entrar } },
    async (requisicao, resposta) => {
      const corpo = esquemaEntrarComoAdmin.parse(requisicao.body);
      const resultado = await entrarComoAdmin(dependencias, { ...corpo, ip: requisicao.ip });
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      gravarCookieDeSessao(resposta, COOKIES.admin, resultado.valor);
      const proximo: RespostaEntradaDoAdmin = { proximoPasso: resultado.valor.proximoPasso };
      return proximo;
    },
  );

  admin.post(
    ROTAS_DO_ADMIN.segundoFator,
    {
      onRequest: protegerCsrf(admin),
      preHandler: exigirSessao(dependencias, 'admin', ['segundo_fator']),
      config: { rateLimit: LIMITES.segundoFator },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const resultado = await confirmarSegundoFatorAdmin(dependencias, {
        administradorId: sessao.titularId,
        hashDaSessaoParcial: sessao.hashId,
        codigo: esquemaConfirmarSegundoFator.parse(requisicao.body).codigoDeVerificacao,
      });
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      gravarCookieDeSessao(resposta, COOKIES.admin, resultado.valor);
      return resposta.code(204).send();
    },
  );

  admin.get(
    ROTAS_DO_ADMIN.sessao,
    { preHandler: exigirSessao(dependencias, 'admin', ['completa']) },
    (_requisicao, resposta) => resposta.code(204).send(),
  );

  admin.delete(ROTAS_DO_ADMIN.sessao, { onRequest: protegerCsrf(admin) }, async (requisicao, resposta) => {
    const token = requisicao.cookies[COOKIES.admin];
    if (token !== undefined && token !== '') {
      await sair(dependencias, token);
    }
    apagarCookieDeSessao(resposta, COOKIES.admin);
    return resposta.code(204).send();
  });
}

function registrarCadastro(admin: FastifyInstance, dependencias: DependenciasDeIdentidade): void {
  const emCadastro = exigirSessao(dependencias, 'admin', ['cadastro']);

  admin.post(
    ROTAS_DO_ADMIN.cadastroDoSegundoFator,
    { onRequest: protegerCsrf(admin), preHandler: emCadastro },
    async (requisicao): Promise<RespostaCadastroIniciado> => {
      const iniciado = await iniciarCadastroSegundoFatorAdmin(dependencias, sessaoDa(requisicao).titularId);
      return { segredo: iniciado.segredo, uriOtpauth: iniciado.endereco };
    },
  );

  admin.post(
    ROTAS_DO_ADMIN.confirmacaoDoCadastro,
    { onRequest: protegerCsrf(admin), preHandler: emCadastro, config: { rateLimit: LIMITES.segundoFator } },
    async (requisicao, resposta) => {
      const corpo = esquemaConcluirCadastroDoSegundoFator.parse(requisicao.body);
      const resultado = await concluirCadastroSegundoFatorAdmin(dependencias, {
        administradorId: sessaoDa(requisicao).titularId,
        codigo: corpo.codigoDeVerificacao,
        senhaNova: corpo.senhaNova,
      });
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      gravarCookieDeSessao(resposta, COOKIES.admin, resultado.valor);
      const concluido: RespostaCadastroConcluido = {
        codigosDeRecuperacao: resultado.valor.codigosDeRecuperacao,
      };
      return concluido;
    },
  );
}
