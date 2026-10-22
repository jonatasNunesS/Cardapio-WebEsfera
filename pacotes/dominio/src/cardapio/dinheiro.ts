import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';

export const DINHEIRO_MAXIMO_EM_CENTAVOS = 1_000_000_00;

declare const marcaDinheiro: unique symbol;

export interface Dinheiro {
  readonly centavos: number;
  readonly [marcaDinheiro]: true;
}

function invalido(centavos: number): ErroDeNegocio {
  return criarErroDeNegocio(
    CODIGOS.DINHEIRO_CRIAR_VALOR_INVALIDO,
    'O valor precisa ser em centavos inteiros, de zero até R$ 1.000.000,00.',
    { centavos },
  );
}

export function criarDinheiro(centavos: number): Resultado<Dinheiro, ErroDeNegocio> {
  if (!Number.isInteger(centavos) || centavos < 0 || centavos > DINHEIRO_MAXIMO_EM_CENTAVOS) {
    return Resultado.falha(invalido(centavos));
  }
  return Resultado.ok({ centavos } as Dinheiro);
}

export function somarDinheiro(...parcelas: readonly Dinheiro[]): Resultado<Dinheiro, ErroDeNegocio> {
  return criarDinheiro(parcelas.reduce((total, parcela) => total + parcela.centavos, 0));
}

function agruparMilhares(reais: number): string {
  return String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatarDinheiro(valor: Dinheiro): string {
  const reais = Math.trunc(valor.centavos / 100);
  const centavos = String(valor.centavos % 100).padStart(2, '0');
  return `R$ ${agruparMilhares(reais)},${centavos}`;
}
