import {
  consultarPlanoECobranca,
  escolherPlanoEAssinar,
  type DependenciasDaAssinatura,
  type PlanoECobranca,
} from '@cardapio/aplicacao';
import {
  CABECALHO_IDEMPOTENCIA,
  esquemaChaveDeIdempotencia,
  esquemaEscolherPlano,
  ROTAS_DA_COBRANCA,
  type RespostaCheckout,
  type RespostaPlanoECobranca,
} from '@cardapio/contratos';
import type { FastifyInstance } from 'fastify';
import { enviarFalhaDeNegocio } from '../http/problema.ts';
import type { DependenciasDeIdentidade } from '../identidade/dependencias.ts';
import { STATUS_DAS_FALHAS } from '../identidade/falhas.ts';
import { LIMITES } from '../identidade/limites.ts';
import { acessoDa, exigirSessao, protegerCsrf } from '../identidade/sessao.ts';

const instante = (data: Date | null) => (data === null ? null : data.toISOString());

function paraResposta(plano: PlanoECobranca, papel: string): RespostaPlanoECobranca {
  const { assinatura } = plano;
  return {
    situacao: plano.situacao,
    testeTerminaEm: plano.testeTerminaEm.toISOString(),
    vencimento: plano.vencimento.toISOString(),
    diaDeAtraso: plano.diaDeAtraso,
    diaDaInadimplencia: plano.diaDaInadimplencia,
    podeAssinar: papel === 'dono' && (assinatura === null || assinatura.situacao === 'pendente'),
    planos: plano.planos.map(({ codigo, nome, precoCentavos, limiteMesas }) => ({
      codigo,
      nome,
      precoCentavos,
      limiteMesas,
    })),
    assinatura:
      assinatura === null
        ? null
        : {
            codigoDoPlano: assinatura.plano.codigo,
            nomeDoPlano: assinatura.plano.nome,
            situacao: assinatura.situacao,
            linkDePagamento: assinatura.situacao === 'pendente' ? assinatura.initPoint : null,
            pagoAte: instante(assinatura.pagoAte),
            proximaCobrancaEm: instante(assinatura.proximaCobrancaEm),
          },
    cobrancas: plano.cobrancas.map((cobranca) => ({
      id: cobranca.mpCobrancaId,
      valorCentavos: cobranca.valorCentavos,
      situacao: cobranca.situacao,
      venceEm: cobranca.venceEm.toISOString(),
      pagaEm: instante(cobranca.pagaEm),
    })),
  };
}

export function registrarCobrancaNoPainel(
  painel: FastifyInstance,
  identidade: DependenciasDeIdentidade,
  dependencias: DependenciasDaAssinatura,
): void {
  const comSessao = exigirSessao(identidade, 'painel', ['completa']);

  painel.get(ROTAS_DA_COBRANCA.plano, { preHandler: comSessao }, async (requisicao, resposta) => {
    const acesso = acessoDa(requisicao, resposta);
    if (acesso === null) {
      return resposta;
    }
    const resultado = await consultarPlanoECobranca(dependencias, acesso);
    if (!resultado.ok) {
      return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
    }
    return resposta
      .header('cache-control', 'private, no-store')
      .send(paraResposta(resultado.valor, acesso.papel));
  });

  painel.post(
    ROTAS_DA_COBRANCA.assinatura,
    { onRequest: protegerCsrf(painel), preHandler: comSessao, config: { rateLimit: LIMITES.escolherPlano } },
    async (requisicao, resposta) => {
      const acesso = acessoDa(requisicao, resposta);
      if (acesso === null) {
        return resposta;
      }
      const chave = esquemaChaveDeIdempotencia.parse(requisicao.headers[CABECALHO_IDEMPOTENCIA]);
      const resultado = await escolherPlanoEAssinar(dependencias, acesso, {
        ...esquemaEscolherPlano.parse(requisicao.body),
        chaveDeIdempotencia: chave,
      });
      if (!resultado.ok) {
        return enviarFalhaDeNegocio(requisicao, resposta, resultado.erro, STATUS_DAS_FALHAS);
      }
      const corpo: RespostaCheckout = { linkDePagamento: resultado.valor.initPoint };
      return resposta.code(201).send(corpo);
    },
  );
}
