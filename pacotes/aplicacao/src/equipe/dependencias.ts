import type { Relogio } from '../compartilhado/portas/relogio.ts';
import type { RepositorioDaEquipe } from './portas/repositorio-da-equipe.ts';

export interface DependenciasDaEquipe {
  readonly equipe: RepositorioDaEquipe;
  readonly relogio: Relogio;
}
