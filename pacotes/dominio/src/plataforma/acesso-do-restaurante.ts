import { podeReceberPedido } from '../cobranca/regua.ts';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import type { SituacaoDoRestaurante } from '../restaurantes/restaurante.ts';

export type SituacaoExibida = SituacaoDoRestaurante | 'suspenso';

export interface AcessoDoRestaurante {
  readonly situacao: SituacaoDoRestaurante;
  readonly suspenso: boolean;
}

export const MOTIVO_DO_ADMIN = { minimo: 3, maximo: 500 } as const;
const MILISSEGUNDOS_POR_DIA = 86_400_000;

// Ponto único: inadimplência e suspensão aberta decidem juntas: docs/adr/0017-intermediario-essencial.md
export function podeReceberPedidos(acesso: AcessoDoRestaurante): boolean {
  return !acesso.suspenso && podeReceberPedido(acesso.situacao);
}

export function situacaoExibida(acesso: AcessoDoRestaurante): SituacaoExibida {
  return acesso.suspenso ? 'suspenso' : acesso.situacao;
}

export function diasRestantesDeTeste(testeTerminaEm: Date, agora: Date): number {
  return Math.max(0, Math.ceil((testeTerminaEm.getTime() - agora.getTime()) / MILISSEGUNDOS_POR_DIA));
}

export function validarMotivoDoAdmin(texto: string): Resultado<string, ErroDeNegocio> {
  const motivo = texto.trim().replace(/\s+/g, ' ');
  return motivo.length >= MOTIVO_DO_ADMIN.minimo && motivo.length <= MOTIVO_DO_ADMIN.maximo
    ? Resultado.ok(motivo)
    : Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.PLATAFORMA_ACAO_MOTIVO_INVALIDO,
          `Explique o motivo em ${String(MOTIVO_DO_ADMIN.minimo)} a ${String(MOTIVO_DO_ADMIN.maximo)} caracteres.`,
          { campo: 'motivo' },
        ),
      );
}
