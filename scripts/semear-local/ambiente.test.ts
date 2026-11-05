import { describe, expect, it } from 'vitest';
import { lerAmbienteDaSemente } from './ambiente.ts';

const LOCAL = {
  APP_ENV: 'local',
  URL_BANCO_MIGRACAO: 'postgres://cardapio_migracao:migracao_local@postgres:5432/cardapio',
  URL_API_LOCAL: 'http://127.0.0.1:3000',
  DOMINIO_PAINEL: 'painel.localhost',
  DOMINIO_ADMIN: 'admin.localhost',
  DOMINIO_CARDAPIO: 'cardapio.localhost',
  CHAVE_CIFRA_TOTP: 'chave',
};

describe('ambiente da semente local', () => {
  it('aceita o .env local e troca o host postgres do Docker pelo computador', () => {
    expect(lerAmbienteDaSemente(LOCAL).urlDoBanco).toBe(
      'postgres://cardapio_migracao:migracao_local@127.0.0.1:5432/cardapio',
    );
  });

  it.each(['staging', 'production', undefined])('recusa APP_ENV=%s', (appEnv) => {
    expect(() => lerAmbienteDaSemente({ ...LOCAL, APP_ENV: appEnv })).toThrow(/APP_ENV=local/);
  });

  it('recusa banco ou API fora do computador', () => {
    expect(() =>
      lerAmbienteDaSemente({ ...LOCAL, URL_BANCO_SEMENTE: 'postgres://u:s@db.exemplo.com:5432/cardapio' }),
    ).toThrow(/endereços locais/);
    expect(() => lerAmbienteDaSemente({ ...LOCAL, URL_API_LOCAL: 'https://api.exemplo.com' })).toThrow(
      /endereços locais/,
    );
  });
});
