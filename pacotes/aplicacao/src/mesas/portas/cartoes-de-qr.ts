export interface DadosDoCartao {
  readonly link: string;
  readonly numero: number;
  readonly nomeDaMesa: string | null;
  readonly nomeDoRestaurante: string;
}

export interface CartoesDeQr {
  cartao(dados: DadosDoCartao): Promise<Uint8Array>;
  zip(cartoes: readonly DadosDoCartao[]): AsyncIterable<Uint8Array>;
}

export interface MesaParaOAdmin {
  readonly numero: number;
  readonly nome: string | null;
  readonly area: string | null;
  readonly codigo: string;
  readonly ativa: boolean;
}

export interface LeituraDeMesasDoAdmin {
  listar(
    administradorId: string,
    slug: string,
  ): Promise<{
    readonly nomeDoRestaurante: string;
    readonly slug: string;
    readonly mesas: readonly MesaParaOAdmin[];
  } | null>;
}
