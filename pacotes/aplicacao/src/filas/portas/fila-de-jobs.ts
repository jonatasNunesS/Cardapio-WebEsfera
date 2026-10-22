export interface PedidoDeJob {
  readonly nome: string;
  readonly idDoJob: string;
  readonly dados: Readonly<Record<string, unknown>>;
  readonly restauranteId?: string | undefined;
}

export interface JobEnfileirado {
  readonly situacao: 'enfileirado' | 'duplicado';
  readonly atrasoMs: number;
}

export interface FilaDeJobs {
  enfileirar(pedido: PedidoDeJob): Promise<JobEnfileirado>;
}
