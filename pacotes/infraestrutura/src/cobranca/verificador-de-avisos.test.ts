import { describe, expect, it } from 'vitest';
import { assinarAviso, criarVerificadorDeAvisos, manifestoDoAviso } from './verificador-de-avisos.ts';

const SEGREDO = 'segredo-de-teste-do-webhook';
const verificador = criarVerificadorDeAvisos(SEGREDO);
const v1 = assinarAviso(SEGREDO, 'abc123', 'req-1', '1730000000');

describe('assinatura do aviso do Mercado Pago', () => {
  it('monta o manifesto id;request-id;ts como na documentação', () => {
    expect(manifestoDoAviso('abc123', 'req-1', '1730000000')).toBe(
      'id:abc123;request-id:req-1;ts:1730000000;',
    );
  });

  it('aceita a assinatura certa, com espaços e chaves em qualquer ordem', () => {
    expect(
      verificador.verificar({ assinatura: `ts=1730000000,v1=${v1}`, xRequestId: 'req-1', dataId: 'abc123' }),
    ).toBe(true);
    expect(
      verificador.verificar({
        assinatura: ` v1=${v1} , ts=1730000000`,
        xRequestId: 'req-1',
        dataId: 'abc123',
      }),
    ).toBe(true);
  });

  it('o data.id é assinado em minúsculas: o maiúsculo só vale depois de normalizado', () => {
    const doProvedor = assinarAviso(SEGREDO, 'abc123', 'req-1', '1730000000');
    const assinatura = `ts=1730000000,v1=${doProvedor}`;

    expect(verificador.verificar({ assinatura, xRequestId: 'req-1', dataId: 'ABC123' })).toBe(false);
    expect(verificador.verificar({ assinatura, xRequestId: 'req-1', dataId: 'ABC123'.toLowerCase() })).toBe(
      true,
    );
  });

  it.each([
    ['assinatura errada', `ts=1730000000,v1=${'0'.repeat(64)}`, 'req-1', 'abc123'],
    [
      'segredo de outro ambiente',
      `ts=1730000000,v1=${assinarAviso('outro', 'abc123', 'req-1', '1730000000')}`,
      'req-1',
      'abc123',
    ],
    ['ts trocado', `ts=1730000001,v1=${v1}`, 'req-1', 'abc123'],
    ['outro x-request-id', `ts=1730000000,v1=${v1}`, 'req-2', 'abc123'],
    ['outro data.id', `ts=1730000000,v1=${v1}`, 'req-1', 'abc124'],
    ['sem ts', `v1=${v1}`, 'req-1', 'abc123'],
    ['sem v1', 'ts=1730000000', 'req-1', 'abc123'],
    ['ts não numérico', `ts=agora,v1=${v1}`, 'req-1', 'abc123'],
    ['cabeçalho vazio', '', 'req-1', 'abc123'],
    ['v1 curto', 'ts=1730000000,v1=abc', 'req-1', 'abc123'],
    ['sem x-request-id', `ts=1730000000,v1=${v1}`, '', 'abc123'],
  ])('recusa %s', (_caso, assinatura, xRequestId, dataId) => {
    expect(verificador.verificar({ assinatura, xRequestId, dataId })).toBe(false);
  });
});
