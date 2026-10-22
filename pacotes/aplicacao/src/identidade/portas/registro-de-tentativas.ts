import type { Publico } from '@cardapio/dominio';

export interface TentativasDoAlvo {
  readonly alvo: string;
  readonly falhas: number;
  readonly ultimaFalhaEm: Date;
}

export interface RegistroDeTentativas {
  consultar(publico: Publico, alvos: readonly string[]): Promise<readonly TentativasDoAlvo[]>;
  registrarFalha(publico: Publico, alvo: string, agora: Date, esquecerAntesDe: Date): Promise<number>;
  limpar(publico: Publico, alvo: string): Promise<void>;
}
