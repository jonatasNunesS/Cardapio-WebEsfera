export type ResolucaoDeMesa =
  | {
      readonly situacao: 'valida' | 'redirecionar';
      readonly restauranteId: string;
      readonly mesaId: string;
      readonly slugAtual: string;
      readonly numeroAtual: number;
    }
  | { readonly situacao: MotivoDaRecusaDaMesa };

export type MotivoDaRecusaDaMesa = 'inativa' | 'cancelado' | 'desconhecido';

export interface RepositorioMesas {
  resolverMesa(slug: string, numero: number, codigo: string): Promise<ResolucaoDeMesa>;
}
