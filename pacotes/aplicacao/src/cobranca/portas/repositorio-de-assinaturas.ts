import type {
  EstadoDaCobranca,
  SituacaoDaAssinatura,
  SituacaoDaCobranca,
  SituacaoDoRestaurante,
} from '@cardapio/dominio';

export interface PlanoOferecido {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly precoCentavos: number;
  readonly limiteMesas: number;
}

export interface AssinaturaGuardada {
  readonly id: string;
  readonly plano: PlanoOferecido;
  readonly mpAssinaturaId: string;
  readonly situacao: SituacaoDaAssinatura;
  readonly initPoint: string;
  readonly pagoAte: Date | null;
  readonly proximaCobrancaEm: Date | null;
}

export interface CobrancaGuardada {
  readonly mpCobrancaId: string;
  readonly mpPagamentoId: string | null;
  readonly valorCentavos: number;
  readonly situacao: SituacaoDaCobranca;
  readonly venceEm: Date;
  readonly pagaEm: Date | null;
}

export interface NovaAssinatura {
  readonly planoId: string;
  readonly mpAssinaturaId: string;
  readonly situacao: SituacaoDaAssinatura;
  readonly initPoint: string;
  readonly proximaCobrancaEm: Date | null;
}

export interface EstadoTravado {
  readonly restaurante: EstadoDaCobranca;
  readonly assinatura: AssinaturaGuardada | null;
  readonly cobrancas: readonly CobrancaGuardada[];
}

export type EventoDeCobranca =
  | {
      readonly tipo: 'AssinaturaAlterada';
      readonly carga: {
        readonly versao: 1;
        readonly assinaturaId: string;
        readonly situacao: SituacaoDaAssinatura;
      };
    }
  | {
      readonly tipo: 'RestauranteSituacaoAlterada';
      readonly carga: {
        readonly versao: 1;
        readonly de: SituacaoDoRestaurante;
        readonly para: SituacaoDoRestaurante;
      };
    };

export interface MudancaDaCobranca {
  readonly assinatura: Pick<AssinaturaGuardada, 'situacao' | 'pagoAte' | 'proximaCobrancaEm'> | null;
  readonly cobrancas: readonly CobrancaGuardada[];
  readonly situacaoDoRestaurante: SituacaoDoRestaurante | null;
  readonly eventos: readonly EventoDeCobranca[];
}

export type DesfechoDaAlteracao = 'aplicada' | 'sem-mudanca' | 'assinatura-desconhecida';

export interface AlvoDaAlteracao {
  readonly restauranteId: string;
  readonly mpAssinaturaId: string | null;
}

export interface RepositorioDeAssinaturas {
  listarPlanos(): Promise<readonly PlanoOferecido[]>;
  assinaturaAtual(restauranteId: string): Promise<AssinaturaGuardada | null>;
  historico(restauranteId: string): Promise<readonly CobrancaGuardada[]>;
  estadoDaCobranca(restauranteId: string): Promise<EstadoDaCobranca>;
  guardarNova(restauranteId: string, nova: NovaAssinatura): Promise<AssinaturaGuardada>;
  alterarComTrava(
    alvo: AlvoDaAlteracao,
    decidir: (estado: EstadoTravado) => MudancaDaCobranca | null,
  ): Promise<DesfechoDaAlteracao>;
}
