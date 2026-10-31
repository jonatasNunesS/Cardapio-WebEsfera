import { podeReceberPedido } from '../cobranca/regua.ts';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import type { SituacaoDoRestaurante } from '../restaurantes/restaurante.ts';
import { SLUGS_RESERVADOS, TAMANHO_MAXIMO_DO_SLUG } from '../restaurantes/slug.ts';

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

const PADRAO_DO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validarSlugDoAdmin(texto: string): Resultado<string, ErroDeNegocio> {
  const slug = texto.trim().toLowerCase();
  return PADRAO_DO_SLUG.test(slug) && slug.length <= TAMANHO_MAXIMO_DO_SLUG && !SLUGS_RESERVADOS.has(slug)
    ? Resultado.ok(slug)
    : Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.PLATAFORMA_CRIAR_SLUG_INVALIDO,
          'Use só letras minúsculas, números e hífens, sem palavra reservada.',
          { campo: 'slug' },
        ),
      );
}
