import type { NivelDaSessao, Publico } from '@cardapio/dominio';
import type { PapelNoRestaurante } from './repositorio-de-contas.ts';

export interface NovaSessao {
  readonly hashId: string;
  readonly publico: Publico;
  readonly titularId: string;
  readonly restauranteId: string | null;
  readonly nivel: NivelDaSessao;
  readonly agora: Date;
  readonly expiraEm: Date;
}

export interface SessaoGuardada {
  readonly sessaoId: string;
  readonly publico: Publico;
  readonly titularId: string;
  readonly nivel: NivelDaSessao;
  readonly restauranteId: string | null;
  readonly papel: PapelNoRestaurante | null;
  readonly criadaEm: Date;
  readonly ultimoUsoEm: Date;
  readonly expiraEm: Date;
}

export interface RepositorioDeSessoes {
  criar(sessao: NovaSessao): Promise<boolean>;
  buscar(hashId: string): Promise<SessaoGuardada | null>;
  renovar(hashId: string, agora: Date): Promise<void>;
  revogar(hashId: string, agora: Date): Promise<void>;
  definirRestaurante(hashId: string, restauranteId: string): Promise<boolean>;
}
