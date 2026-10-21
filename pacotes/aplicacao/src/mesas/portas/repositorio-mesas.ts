export type ResolucaoDeMesa =
  | {
      readonly situacao: 'valida' | 'redirecionar';
      readonly restauranteId: string;
      readonly mesaId: string;
      readonly slugAtual: string;
      readonly numeroAtual: number;
    }
  | { readonly situacao: 'invalida'; readonly codigoReconhecido: boolean };

export interface RepositorioMesas {
  resolverMesa(slug: string, numero: number, codigo: string): Promise<ResolucaoDeMesa>;
}
