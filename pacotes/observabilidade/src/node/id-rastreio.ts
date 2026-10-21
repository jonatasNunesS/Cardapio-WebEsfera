import { v7 as uuidv7 } from 'uuid';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function gerarIdRastreio(): string {
  return uuidv7();
}

export function ehIdRastreioValido(valor: unknown): valor is string {
  return typeof valor === 'string' && PADRAO_UUID.test(valor);
}
