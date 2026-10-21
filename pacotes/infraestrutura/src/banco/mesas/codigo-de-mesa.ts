import { randomBytes } from 'node:crypto';

export function gerarCodigoDeMesa(): string {
  return randomBytes(16).toString('base64url');
}
