export interface MesaGuardada {
  readonly id: string;
  readonly numero: number;
  readonly nome: string | null;
  readonly area: string | null;
  readonly codigo: string;
  readonly ativa: boolean;
}

export interface MesasDoRestaurante {
  readonly slug: string;
  readonly nomeDoRestaurante: string;
  readonly mesas: readonly MesaGuardada[];
}

export interface NovaMesa {
  readonly numero: number;
  readonly nome: string | null;
  readonly area: string | null;
  readonly codigo: string;
}

export type DesfechoDaMesa =
  | { readonly tipo: 'ok'; readonly mesa: MesaGuardada }
  | { readonly tipo: 'nao-encontrada' | 'numero-repetido' | 'codigo-repetido' | 'limite' };

export interface Autoria {
  readonly usuarioId: string | null;
}

export interface RepositorioDeMesas {
  listar(restauranteId: string): Promise<MesasDoRestaurante>;
  criar(restauranteId: string, nova: NovaMesa, limite: number, autoria: Autoria): Promise<DesfechoDaMesa>;
  editar(
    restauranteId: string,
    mesaId: string,
    dados: Pick<NovaMesa, 'nome' | 'area'>,
    autoria: Autoria,
  ): Promise<DesfechoDaMesa>;
  renumerar(restauranteId: string, mesaId: string, numero: number, autoria: Autoria): Promise<DesfechoDaMesa>;
  alterarAtiva(
    restauranteId: string,
    mesaId: string,
    ativa: boolean,
    limite: number,
    autoria: Autoria,
  ): Promise<DesfechoDaMesa>;
  trocarCodigo(
    restauranteId: string,
    mesaId: string,
    codigo: string,
    autoria: Autoria,
  ): Promise<DesfechoDaMesa>;
}

export interface LimiteDeMesas {
  limite(restauranteId: string): Promise<number>;
}

export interface GeradorDeCodigoDeMesa {
  gerar(): string;
}
