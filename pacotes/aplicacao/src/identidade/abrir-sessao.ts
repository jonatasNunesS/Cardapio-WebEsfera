import { CODIGOS, expiracaoDaNovaSessao, type NivelDaSessao, type Publico } from '@cardapio/dominio';
import { ErroEstadoInconsistente } from '../compartilhado/erros/erro-estado-inconsistente.ts';
import type { GeradorDeSegredos } from './portas/gerador-de-segredos.ts';
import type { RepositorioDeSessoes } from './portas/repositorio-de-sessoes.ts';

export interface SessaoAberta {
  readonly token: string;
  readonly expiraEm: Date;
}

export interface PedidoDeSessao {
  readonly publico: Publico;
  readonly titularId: string;
  readonly restauranteId: string | null;
  readonly nivel: NivelDaSessao;
  readonly agora: Date;
  readonly casoDeUso: string;
}

export async function abrirSessao(
  dependencias: { readonly sessoes: RepositorioDeSessoes; readonly segredos: GeradorDeSegredos },
  pedido: PedidoDeSessao,
): Promise<SessaoAberta> {
  const token = dependencias.segredos.token();
  const expiraEm = expiracaoDaNovaSessao(pedido.publico, pedido.nivel, pedido.agora);
  const criada = await dependencias.sessoes.criar({
    hashId: dependencias.segredos.resumo(token),
    publico: pedido.publico,
    titularId: pedido.titularId,
    restauranteId: pedido.restauranteId,
    nivel: pedido.nivel,
    agora: pedido.agora,
    expiraEm,
  });
  if (!criada) {
    throw new ErroEstadoInconsistente(CODIGOS.SESSAO_CRIAR_RECUSADA, 'O banco recusou a sessão nova', {
      modulo: 'identidade',
      casoDeUso: pedido.casoDeUso,
      dados: { publico: pedido.publico, nivel: pedido.nivel },
    });
  }
  return { token, expiraEm };
}
