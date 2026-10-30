export interface AvisoRecebido {
  readonly xRequestId: string;
  readonly topico: string;
  readonly recursoId: string;
}

export interface EventoRegistrado {
  readonly eventoId: string;
  readonly processado: boolean;
}

export interface EventoEmProcessamento {
  readonly topico: string;
  readonly recursoId: string;
}

export interface RegistroDeAvisos {
  registrar(aviso: AvisoRecebido): Promise<EventoRegistrado>;
}

export interface EventosDePagamento {
  iniciar(eventoId: string, agora: Date): Promise<EventoEmProcessamento | null>;
  concluir(eventoId: string, agora: Date): Promise<void>;
  registrarFalha(eventoId: string, codigo: string): Promise<void>;
  listarPendentes(recebidosAntesDe: Date, limite: number): Promise<readonly string[]>;
}

export interface RestaurantesParaCobranca {
  listar(apos: string | null, limite: number): Promise<readonly string[]>;
}

export interface VerificadorDeAvisos {
  verificar(aviso: {
    readonly assinatura: string;
    readonly xRequestId: string;
    readonly dataId: string;
  }): boolean;
}

export interface ChamadaDoProcessamento {
  avisar(eventoId: string): Promise<'enfileirado' | 'adiado'>;
}
