import {
  CODIGOS,
  ErroAplicacao,
  ErroDependenciaExterna,
  ErroIsolamentoInquilino,
  type DadosDaDependencia,
} from '@cardapio/aplicacao';
import type { ContextoDeExecucao } from '../contexto.ts';

export interface DescricaoDoErro {
  readonly classe: string;
  readonly codigo: string;
  readonly mensagem: string;
  readonly modulo: string;
  readonly nivel: 'fatal' | 'error';
  readonly casoDeUso?: string | undefined;
  readonly restauranteId?: string | undefined;
  readonly negocio?: Readonly<Record<string, unknown>> | undefined;
  readonly dependencia?: DadosDaDependencia | undefined;
}

function descreverNegocio(erro: ErroAplicacao): Record<string, unknown> | undefined {
  const { entidade, entidadeId, dados } = erro.contexto;
  if (entidade === undefined && entidadeId === undefined && dados === undefined) {
    return undefined;
  }
  return { entidade, entidade_id: entidadeId, dados };
}

export function descreverErro(erro: unknown, contexto: ContextoDeExecucao | undefined): DescricaoDoErro {
  if (!(erro instanceof ErroAplicacao)) {
    return {
      classe: erro instanceof Error ? erro.name : typeof erro,
      codigo: CODIGOS.SISTEMA_FALHA_NAO_TIPADA,
      mensagem: erro instanceof Error ? erro.message : String(erro),
      modulo: 'desconhecido',
      nivel: 'error',
      casoDeUso: contexto?.casoDeUso,
      restauranteId: contexto?.restauranteId,
    };
  }
  return {
    classe: erro.name,
    codigo: erro.codigo,
    mensagem: erro.message,
    modulo: erro.contexto.modulo,
    nivel: erro instanceof ErroIsolamentoInquilino ? 'fatal' : 'error',
    casoDeUso: erro.contexto.casoDeUso ?? contexto?.casoDeUso,
    restauranteId: erro.contexto.restauranteId ?? contexto?.restauranteId,
    negocio: descreverNegocio(erro),
    dependencia: erro instanceof ErroDependenciaExterna ? erro.dependencia : undefined,
  };
}

export function tituloDoErro(descricao: DescricaoDoErro): string {
  return `${descricao.classe}: ${descricao.codigo} - ${descricao.mensagem}`;
}
