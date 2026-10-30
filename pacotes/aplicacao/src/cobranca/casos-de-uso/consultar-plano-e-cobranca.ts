import {
  CODIGOS,
  criarErroDeNegocio,
  DIA_DA_INADIMPLENCIA,
  diaDeAtraso,
  Resultado,
  vencimentoDoAcesso,
  type ErroDeNegocio,
  type SituacaoDoRestaurante,
} from '@cardapio/dominio';
import { podeGerir, type AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaAssinatura } from '../dependencias.ts';
import type {
  AssinaturaGuardada,
  CobrancaGuardada,
  PlanoOferecido,
} from '../portas/repositorio-de-assinaturas.ts';

export interface PlanoECobranca {
  readonly situacao: SituacaoDoRestaurante;
  readonly testeTerminaEm: Date;
  readonly vencimento: Date;
  readonly diaDeAtraso: number;
  readonly diaDaInadimplencia: number;
  readonly planos: readonly PlanoOferecido[];
  readonly assinatura: AssinaturaGuardada | null;
  readonly cobrancas: readonly CobrancaGuardada[];
}

export async function consultarPlanoECobranca(
  dependencias: DependenciasDaAssinatura,
  acesso: AcessoAoRestaurante,
): Promise<Resultado<PlanoECobranca, ErroDeNegocio>> {
  if (!podeGerir(acesso)) {
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.ASSINATURA_CONSULTAR_SEM_PERMISSAO, 'Só o dono ou o gerente vê a cobrança.'),
    );
  }
  const { restauranteId } = acesso;
  const [estado, planos, assinatura, cobrancas] = await Promise.all([
    dependencias.assinaturas.estadoDaCobranca(restauranteId),
    dependencias.assinaturas.listarPlanos(),
    dependencias.assinaturas.assinaturaAtual(restauranteId),
    dependencias.assinaturas.historico(restauranteId),
  ]);
  const vencimento = vencimentoDoAcesso(estado);
  return Resultado.ok({
    situacao: estado.situacaoAtual,
    testeTerminaEm: estado.testeTerminaEm,
    vencimento,
    diaDeAtraso: diaDeAtraso(vencimento, dependencias.relogio.agora(), estado.fusoHorario),
    diaDaInadimplencia: DIA_DA_INADIMPLENCIA,
    planos,
    assinatura,
    cobrancas,
  });
}
