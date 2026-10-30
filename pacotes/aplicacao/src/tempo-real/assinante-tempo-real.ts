export interface AvisoTempoReal {
  readonly id: string;
  readonly tipo: string;
  readonly restauranteId: string;
  readonly ocorridoEm: string;
  readonly versao: number;
  readonly dados: Readonly<Record<string, unknown>>;
}

export interface OuvinteTempoReal {
  aoReceber(aviso: AvisoTempoReal): void;
  aoCair(): void;
}

export type CancelarAssinatura = () => void;

export interface AssinanteTempoReal {
  assinar(restauranteId: string, ouvinte: OuvinteTempoReal): Promise<CancelarAssinatura>;
  encerrar(): Promise<void>;
}
