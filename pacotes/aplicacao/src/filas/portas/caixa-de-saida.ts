import type { EventoPublicavel } from './publicador-tempo-real.ts';

export interface ResumoDaPublicacao {
  readonly publicados: number;
  readonly falhas: number;
}

export interface CaixaDeSaida {
  publicarPendentes(
    lote: number,
    publicar: (evento: EventoPublicavel) => Promise<void>,
  ): Promise<ResumoDaPublicacao>;
}
