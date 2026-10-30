import type { Relogio } from '../compartilhado/portas/relogio.ts';
import type { RepositorioDeAtendimento } from './portas/repositorio-de-atendimento.ts';

export interface DependenciasDoAtendimento {
  readonly atendimento: RepositorioDeAtendimento;
  readonly relogio: Relogio;
}
