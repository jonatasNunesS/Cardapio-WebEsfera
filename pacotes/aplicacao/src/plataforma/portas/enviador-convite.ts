export interface ConviteParaEnviar {
  readonly nome: string;
  readonly email: string;
  readonly link: string;
  readonly expiraEm: Date;
}

export interface EntregaDoConvite {
  readonly linkParaOAdmin: string | null;
}

export interface EnviadorConvite {
  enviar(convite: ConviteParaEnviar): Promise<EntregaDoConvite>;
}
