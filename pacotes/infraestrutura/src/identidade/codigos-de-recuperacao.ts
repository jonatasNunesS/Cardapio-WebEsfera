import { randomInt } from 'node:crypto';
import type { GeradorDeCodigosDeRecuperacao } from '@cardapio/aplicacao';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAMANHO_DO_BLOCO = 5;

function bloco(): string {
  return Array.from({ length: TAMANHO_DO_BLOCO }, () => ALFABETO.charAt(randomInt(ALFABETO.length))).join('');
}

export const geradorDeCodigosDeRecuperacao: GeradorDeCodigosDeRecuperacao = {
  gerar: (quantidade) => Array.from({ length: quantidade }, () => `${bloco()}-${bloco()}`),
  normalizar: (codigo) => codigo.toUpperCase().replace(/[^A-Z0-9]/g, ''),
};
