import {
  CODIGOS,
  criarErroDeNegocio,
  ehEmailValido,
  normalizarEmail,
  Resultado,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaAssinatura } from '../dependencias.ts';

export interface PedidoDePlano {
  readonly codigoDoPlano: string;
  readonly emailDoPagador: string;
  readonly chaveDeIdempotencia: string;
}

export interface CheckoutDaAssinatura {
  readonly initPoint: string;
}

const falha = (codigo: string, mensagem: string, detalhes?: Readonly<Record<string, unknown>>) =>
  Resultado.falha(criarErroDeNegocio(codigo, mensagem, detalhes));

export async function escolherPlanoEAssinar(
  dependencias: DependenciasDaAssinatura,
  acesso: AcessoAoRestaurante,
  pedido: PedidoDePlano,
): Promise<Resultado<CheckoutDaAssinatura, ErroDeNegocio>> {
  if (acesso.papel !== 'dono') {
    return falha(CODIGOS.ASSINATURA_ESCOLHER_SEM_PERMISSAO, 'Só o dono escolhe o plano.');
  }
  const email = normalizarEmail(pedido.emailDoPagador);
  if (!ehEmailValido(email)) {
    return falha(
      CODIGOS.ASSINATURA_ESCOLHER_EMAIL_INVALIDO,
      'Informe o e-mail da sua conta do Mercado Pago.',
      {
        campo: 'emailDoPagador',
      },
    );
  }
  const planos = await dependencias.assinaturas.listarPlanos();
  const plano = planos.find((item) => item.codigo === pedido.codigoDoPlano);
  if (plano === undefined) {
    return falha(CODIGOS.ASSINATURA_ESCOLHER_PLANO_INVALIDO, 'Este plano não está disponível.', {
      campo: 'codigoDoPlano',
    });
  }
  const atual = await dependencias.assinaturas.assinaturaAtual(acesso.restauranteId);
  if (atual !== null && atual.situacao !== 'pendente') {
    return falha(
      CODIGOS.ASSINATURA_ESCOLHER_JA_AUTORIZADA,
      'Você já tem uma assinatura. Para trocar de plano, fale com o suporte.',
    );
  }
  if (atual?.plano.id === plano.id) {
    return Resultado.ok({ initPoint: atual.initPoint });
  }
  const criada = await dependencias.gateway.criarAssinatura({
    referenciaExterna: acesso.restauranteId,
    motivo: `Cardápio WebEsfera - Plano ${plano.nome}`,
    valorCentavos: plano.precoCentavos,
    emailDoPagador: email,
    urlDeRetorno: dependencias.urlDeRetorno,
    chaveDeIdempotencia: pedido.chaveDeIdempotencia,
  });
  const guardada = await dependencias.assinaturas.guardarNova(acesso.restauranteId, {
    planoId: plano.id,
    mpAssinaturaId: criada.id,
    situacao: criada.situacao,
    initPoint: criada.initPoint,
    proximaCobrancaEm: criada.proximaCobrancaEm,
  });
  return Resultado.ok({ initPoint: guardada.initPoint });
}
