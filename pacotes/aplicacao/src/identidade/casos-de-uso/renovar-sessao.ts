import {
  CODIGOS,
  criarErroDeNegocio,
  precisaRenovar,
  Resultado,
  sessaoExpirou,
  type ErroDeNegocio,
  type NivelDaSessao,
  type Publico,
} from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import type { GeradorDeSegredos } from '../portas/gerador-de-segredos.ts';
import type { PapelNoRestaurante } from '../portas/repositorio-de-contas.ts';
import type { RepositorioDeSessoes } from '../portas/repositorio-de-sessoes.ts';

export interface DependenciasDeRenovarSessao {
  readonly sessoes: RepositorioDeSessoes;
  readonly segredos: GeradorDeSegredos;
  readonly relogio: Relogio;
}

export interface EntradaDeRenovarSessao {
  readonly token: string;
  readonly publico: Publico;
  readonly niveis: readonly NivelDaSessao[];
}

export interface SessaoValida {
  readonly hashId: string;
  readonly titularId: string;
  readonly nivel: NivelDaSessao;
  readonly restauranteId: string | null;
  readonly papel: PapelNoRestaurante | null;
}

const invalida = () =>
  Resultado.falha(criarErroDeNegocio(CODIGOS.SESSAO_VALIDAR_INVALIDA, 'Sua sessão terminou. Entre de novo.'));

export async function renovarSessao(
  dependencias: DependenciasDeRenovarSessao,
  entrada: EntradaDeRenovarSessao,
): Promise<Resultado<SessaoValida, ErroDeNegocio>> {
  const agora = dependencias.relogio.agora();
  const hashId = dependencias.segredos.resumo(entrada.token);
  const sessao = await dependencias.sessoes.buscar(hashId);
  if (sessao?.publico !== entrada.publico || !entrada.niveis.includes(sessao.nivel)) {
    return invalida();
  }
  if (sessaoExpirou(sessao, agora)) {
    await dependencias.sessoes.revogar(hashId, agora);
    return invalida();
  }
  if (precisaRenovar(sessao, agora)) {
    await dependencias.sessoes.renovar(hashId, agora);
  }
  return Resultado.ok({
    hashId,
    titularId: sessao.titularId,
    nivel: sessao.nivel,
    restauranteId: sessao.restauranteId,
    papel: sessao.papel,
  });
}
