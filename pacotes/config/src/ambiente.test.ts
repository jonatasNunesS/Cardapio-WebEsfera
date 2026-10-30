import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { carregarAmbiente, exigirMercadoPagoReal, URL_DA_API_DO_MERCADO_PAGO } from './ambiente.ts';

const esquema = z.object({
  URL_BANCO: z.url(),
  URL_REDIS: z.url(),
  SEGREDO_WEBHOOK: z.string().min(10),
  PORTA_API: z.coerce.number().int(),
});

class EncerramentoSimulado extends Error {}

function capturarEncerramento(fonte: Record<string, string>): { mensagem: string; codigo: unknown } {
  const escritas: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((texto) => {
    escritas.push(String(texto));
    return true;
  });
  let codigo: unknown;
  vi.spyOn(process, 'exit').mockImplementation((recebido) => {
    codigo = recebido;
    throw new EncerramentoSimulado();
  });
  expect(() => carregarAmbiente(esquema, fonte)).toThrow(EncerramentoSimulado);
  return { mensagem: escritas.join(''), codigo };
}

describe('carregarAmbiente', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve o ambiente validado quando nada falta', () => {
    const ambiente = carregarAmbiente(esquema, {
      URL_BANCO: 'postgres://usuario@localhost:5432/banco',
      URL_REDIS: 'redis://localhost:6379',
      SEGREDO_WEBHOOK: 'segredo-com-mais-de-dez',
      PORTA_API: '3000',
    });
    expect(ambiente.PORTA_API).toBe(3000);
  });

  it('encerra listando as duas variáveis faltando, sem imprimir nenhum valor', () => {
    const segredo = 'segredo-que-nao-pode-vazar-123';
    const urlInvalida = 'isto-nao-e-uma-url-xyz';

    const { mensagem, codigo } = capturarEncerramento({
      SEGREDO_WEBHOOK: segredo,
      PORTA_API: '3000',
      URL_REDIS: urlInvalida,
    });

    expect(codigo).toBe(1);
    expect(mensagem).toContain('URL_BANCO: ausente');
    expect(mensagem).toContain('URL_REDIS: inválida');
    expect(mensagem).not.toContain('SEGREDO_WEBHOOK');
    expect(mensagem).not.toContain(segredo);
    expect(mensagem).not.toContain(urlInvalida);
    expect(mensagem).not.toContain('3000');
  });

  it('lista todas as variáveis ausentes de uma vez', () => {
    const { mensagem } = capturarEncerramento({
      SEGREDO_WEBHOOK: 'segredo-com-mais-de-dez',
      PORTA_API: '3000',
    });

    expect(mensagem).toContain('URL_BANCO: ausente');
    expect(mensagem).toContain('URL_REDIS: ausente');
  });
});

describe('Mercado Pago por ambiente', () => {
  it('só o ambiente local aponta para outro endereço (o Mercado Pago falso)', () => {
    expect(exigirMercadoPagoReal({ APP_ENV: 'local', URL_MERCADO_PAGO: 'http://127.0.0.1:3999' })).toBe(true);
    expect(exigirMercadoPagoReal({ APP_ENV: 'producao', URL_MERCADO_PAGO: URL_DA_API_DO_MERCADO_PAGO })).toBe(
      true,
    );
    expect(exigirMercadoPagoReal({ APP_ENV: 'producao', URL_MERCADO_PAGO: 'http://127.0.0.1:3999' })).toBe(
      false,
    );
    expect(exigirMercadoPagoReal({ APP_ENV: 'preview', URL_MERCADO_PAGO: 'https://falso.exemplo.com' })).toBe(
      false,
    );
  });
});
