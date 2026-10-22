import type { Horario } from '@cardapio/dominio';

export interface RepositorioDeHorarios {
  substituir(restauranteId: string, horarios: readonly Horario[]): Promise<void>;
}
