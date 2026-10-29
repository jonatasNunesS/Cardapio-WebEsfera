export interface SessaoDeMesaAberta {
  readonly sessaoId: string;
  readonly expiraEm: Date;
}

export interface SessoesDeMesa {
  abrirOuReusar(
    restauranteId: string,
    mesaId: string,
    agora: Date,
    expiraEm: Date,
  ): Promise<SessaoDeMesaAberta>;
}

export interface ContadorDeTentativasInvalidas {
  registrar(origem: string): Promise<number>;
}
