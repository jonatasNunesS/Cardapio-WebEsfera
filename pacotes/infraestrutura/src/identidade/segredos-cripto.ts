import { createHash, randomBytes } from 'node:crypto';
import type { GeradorDeSegredos } from '@cardapio/aplicacao';

export const BYTES_DO_TOKEN = 32;

export const geradorDeSegredos: GeradorDeSegredos = {
  token: () => randomBytes(BYTES_DO_TOKEN).toString('base64url'),
  resumo: (valor) => createHash('sha256').update(valor, 'utf8').digest('hex'),
};
