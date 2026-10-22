export type PapelDeAcesso = 'dono' | 'gerente' | 'garcom' | 'cozinha';

export interface AcessoAoRestaurante {
  readonly restauranteId: string;
  readonly papel: PapelDeAcesso;
}

export const PAPEIS_DE_GESTAO: readonly PapelDeAcesso[] = ['dono', 'gerente'];

export function podeGerir(acesso: AcessoAoRestaurante): boolean {
  return PAPEIS_DE_GESTAO.includes(acesso.papel);
}
