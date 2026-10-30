import type { SituacaoDaAssinatura, SituacaoDaCobranca } from '@cardapio/dominio';

export interface PedidoDeAssinatura {
  readonly referenciaExterna: string;
  readonly motivo: string;
  readonly valorCentavos: number;
  readonly emailDoPagador: string;
  readonly urlDeRetorno: string;
  readonly chaveDeIdempotencia: string;
}

export interface AssinaturaNoProvedor {
  readonly id: string;
  readonly situacao: SituacaoDaAssinatura;
  readonly referenciaExterna: string | null;
  readonly initPoint: string;
  readonly proximaCobrancaEm: Date | null;
}

export interface CobrancaNoProvedor {
  readonly id: string;
  readonly assinaturaId: string;
  readonly situacao: SituacaoDaCobranca;
  readonly pagamentoId: string | null;
  readonly valorCentavos: number;
  readonly venceEm: Date;
}

export interface GatewayPagamento {
  criarAssinatura(pedido: PedidoDeAssinatura): Promise<AssinaturaNoProvedor>;
  consultarAssinatura(id: string): Promise<AssinaturaNoProvedor | null>;
  consultarCobranca(id: string): Promise<CobrancaNoProvedor | null>;
  listarCobrancas(assinaturaId: string): Promise<readonly CobrancaNoProvedor[]>;
}
