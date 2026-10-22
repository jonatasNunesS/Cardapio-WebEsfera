export interface SessaoMesaVencida {
  readonly restauranteId: string;
  readonly sessaoMesaId: string;
}

export interface SessoesMesaVencidas {
  listar(agora: Date, limite: number): Promise<readonly SessaoMesaVencida[]>;
  fechar(restauranteId: string, sessoesMesaIds: readonly string[], agora: Date): Promise<number>;
}
