import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import type { GeradorDeSegredos } from '../portas/gerador-de-segredos.ts';
import type { RepositorioDeSessoes } from '../portas/repositorio-de-sessoes.ts';

export interface DependenciasDeSair {
  readonly sessoes: RepositorioDeSessoes;
  readonly segredos: GeradorDeSegredos;
  readonly relogio: Relogio;
}

export async function sair(dependencias: DependenciasDeSair, token: string): Promise<void> {
  await dependencias.sessoes.revogar(dependencias.segredos.resumo(token), dependencias.relogio.agora());
}
