import type { PratoValido } from '@cardapio/dominio';
import type { DadosDoPratoParaGravar } from './portas/repositorio-do-cardapio.ts';

export function paraGravar(prato: PratoValido): DadosDoPratoParaGravar {
  const { preco, ...resto } = prato;
  return { ...resto, precoCentavos: preco.centavos };
}
