import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import type { SessaoMesaVencida, SessoesMesaVencidas } from '../portas/sessoes-mesa-vencidas.ts';

export const LOTE_DE_SESSOES_VENCIDAS = 500;
export const LOTES_POR_EXECUCAO = 20;

export interface DependenciasDeExpirarSessoesMesa {
  readonly sessoesMesa: SessoesMesaVencidas;
  readonly relogio: Relogio;
}

function porRestaurante(vencidas: readonly SessaoMesaVencida[]): Map<string, string[]> {
  const grupos = new Map<string, string[]>();
  for (const { restauranteId, sessaoMesaId } of vencidas) {
    grupos.set(restauranteId, [...(grupos.get(restauranteId) ?? []), sessaoMesaId]);
  }
  return grupos;
}

export async function expirarSessoesMesa(
  dependencias: DependenciasDeExpirarSessoesMesa,
  lote = LOTE_DE_SESSOES_VENCIDAS,
): Promise<number> {
  const agora = dependencias.relogio.agora();
  let fechadas = 0;
  for (let rodada = 0; rodada < LOTES_POR_EXECUCAO; rodada += 1) {
    const vencidas = await dependencias.sessoesMesa.listar(agora, lote);
    for (const [restauranteId, ids] of porRestaurante(vencidas)) {
      fechadas += await dependencias.sessoesMesa.fechar(restauranteId, ids, agora);
    }
    if (vencidas.length < lote) {
      break;
    }
  }
  return fechadas;
}
