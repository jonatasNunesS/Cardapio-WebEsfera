export interface EventoPublicavel {
  readonly id: string;
  readonly restauranteId: string;
  readonly tipo: string;
  readonly carga: Readonly<Record<string, unknown>>;
  readonly ocorridoEm: Date;
}

export interface PublicadorTempoReal {
  publicar(evento: EventoPublicavel): Promise<void>;
}
