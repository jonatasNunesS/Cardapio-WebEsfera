import {
  aceitarConvite,
  alternarSuspensao,
  criarRestauranteComDono,
  gerarNovoConvite,
  listarRestaurantes,
  obterIndicadores,
  verFinanceiro,
  type AcessoDoAdmin,
  type DependenciasDaPlataforma,
  type ErroDeNegocio,
  type FinanceiroDoRestaurante,
  type Resultado,
} from '@cardapio/aplicacao';
import {
  esquemaAceitarConvite,
  esquemaMotivoDoAdmin,
  esquemaNovoRestauranteDoAdmin,
  esquemaSlugDoAdmin,
  ROTAS_DA_PLATAFORMA as ROTAS,
  ROTAS_DO_CONVITE,
  type RespostaFinanceiroDoRestaurante,
  type RespostaVisaoGeral,
} from '@cardapio/contratos';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { exigirSessao, protegerCsrf, sessaoDa } from '../identidade/sessao.ts';

const acessoDoAdmin = (requisicao: FastifyRequest): AcessoDoAdmin => ({
  administradorId: sessaoDa(requisicao).titularId,
});
const slugDa = (requisicao: FastifyRequest) => esquemaSlugDoAdmin.parse(requisicao.params).slug;
const data = (valor: Date | null) => (valor === null ? null : valor.toISOString());

function responder<T>(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  resultado: Resultado<T, ErroDeNegocio>,
  enviar: (valor: T) => unknown,
) {
  resposta.header('cache-control', 'private, no-store');
  return resultado.ok
    ? enviar(resultado.valor)
    : enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
}

function paraFinanceiro(financeiro: FinanceiroDoRestaurante): RespostaFinanceiroDoRestaurante {
  const { assinatura } = financeiro;
  return {
    situacaoDoRestaurante: financeiro.situacaoDoRestaurante,
    assinatura:
      assinatura === null
        ? null
        : {
            ...assinatura,
            pagoAte: data(assinatura.pagoAte),
            proximaCobrancaEm: data(assinatura.proximaCobrancaEm),
          },
    cobrancas: financeiro.cobrancas.map((cobranca) => ({
      ...cobranca,
      venceEm: cobranca.venceEm.toISOString(),
      pagaEm: data(cobranca.pagaEm),
    })),
  };
}

export interface OpcoesDaPlataforma {
  readonly dependencias: DependenciasDaPlataforma;
  readonly linkDoSentry: string | null;
}

function registrarEscritas(admin: FastifyInstance, opcoes: OpcoesDaPlataforma, escrita: object): void {
  const { dependencias } = opcoes;
  admin.post(ROTAS.restaurantes, escrita, async (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      await criarRestauranteComDono(
        dependencias,
        acessoDoAdmin(requisicao),
        esquemaNovoRestauranteDoAdmin.parse(requisicao.body),
      ),
      (criado) => resposta.code(201).send(criado),
    ),
  );
  admin.post(ROTAS.convite, escrita, async (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      await gerarNovoConvite(dependencias, acessoDoAdmin(requisicao), slugDa(requisicao)),
      (convite) => resposta.code(201).send({ slug: slugDa(requisicao), ...convite }),
    ),
  );
  for (const [rota, suspender] of [
    [ROTAS.suspensao, true],
    [ROTAS.reativacao, false],
  ] as const) {
    admin.post(rota, escrita, async (requisicao, resposta) =>
      responder(
        requisicao,
        resposta,
        await alternarSuspensao(dependencias, acessoDoAdmin(requisicao), {
          slug: slugDa(requisicao),
          suspender,
          motivo: esquemaMotivoDoAdmin.parse(requisicao.body).motivo,
        }),
        () => resposta.code(204).send(),
      ),
    );
  }
}

export function registrarPlataformaNoAdmin(
  admin: FastifyInstance,
  identidade: DependenciasDeIdentidade,
  opcoes: OpcoesDaPlataforma,
): void {
  const comSessao = exigirSessao(identidade, 'admin', ['completa']);
  const leitura = { preHandler: comSessao };
  const { dependencias } = opcoes;
  admin.get(ROTAS.restaurantes, leitura, async (requisicao, resposta) =>
    resposta
      .header('cache-control', 'private, no-store')
      .send({ restaurantes: await listarRestaurantes(dependencias, acessoDoAdmin(requisicao)) }),
  );
  admin.get(ROTAS.financeiro, leitura, async (requisicao, resposta) =>
    responder(
      requisicao,
      resposta,
      await verFinanceiro(dependencias, acessoDoAdmin(requisicao), slugDa(requisicao)),
      (financeiro) => resposta.send(paraFinanceiro(financeiro)),
    ),
  );
  admin.get(ROTAS.visaoGeral, leitura, async (requisicao, resposta) => {
    const corpo: RespostaVisaoGeral = {
      ...(await obterIndicadores(dependencias, acessoDoAdmin(requisicao))),
      linkDoSentry: opcoes.linkDoSentry,
    };
    return resposta.header('cache-control', 'private, no-store').send(corpo);
  });
  registrarEscritas(admin, opcoes, { onRequest: protegerCsrf(admin), preHandler: comSessao });
}

export function registrarAceiteDoConvite(
  painel: FastifyInstance,
  dependencias: DependenciasDaPlataforma,
): void {
  painel.post(
    ROTAS_DO_CONVITE.aceitacao,
    { onRequest: protegerCsrf(painel), config: { rateLimit: LIMITES.redefinirSenha } },
    async (requisicao, resposta) =>
      responder(
        requisicao,
        resposta,
        await aceitarConvite(dependencias, esquemaAceitarConvite.parse(requisicao.body)),
        () => resposta.code(204).send(),
      ),
  );
}
