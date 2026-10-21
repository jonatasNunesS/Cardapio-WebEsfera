import { describe, expect, it } from 'vitest';
import { construirServidor } from './servidor.ts';

describe('GET /saude', () => {
  it('responde 200 com a situação ok', async () => {
    const servidor = construirServidor({ registrarLogs: false });

    const resposta = await servidor.inject({ method: 'GET', url: '/saude' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ situacao: 'ok' });
    await servidor.close();
  });
});
