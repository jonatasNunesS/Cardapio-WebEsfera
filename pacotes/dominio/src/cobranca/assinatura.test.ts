import { describe, expect, it } from 'vitest';
import { LIMITE_MESAS_TESTE } from '../mesas/mesa.ts';
import { coberturaDoPagamento, limiteDeMesasPelaAssinatura, pagoAtePelasCobrancas } from './assinatura.ts';

describe('assinatura', () => {
  it('sem assinatura autorizada, o limite é o do teste (30 mesas)', () => {
    expect(limiteDeMesasPelaAssinatura(null)).toBe(LIMITE_MESAS_TESTE);
    expect(limiteDeMesasPelaAssinatura({ situacao: 'pendente', limiteMesas: 10 })).toBe(30);
    expect(limiteDeMesasPelaAssinatura({ situacao: 'cancelada', limiteMesas: 10 })).toBe(30);
  });

  it('com assinatura autorizada, o limite é o do plano', () => {
    expect(limiteDeMesasPelaAssinatura({ situacao: 'autorizada', limiteMesas: 10 })).toBe(10);
  });

  it('cada pagamento cobre um mês a partir do vencimento da cobrança', () => {
    expect(coberturaDoPagamento(new Date('2026-11-10T15:00:00Z'))).toEqual(new Date('2026-12-10T15:00:00Z'));
  });

  it('pago até é o fim da cobertura mais longa entre as cobranças pagas', () => {
    expect(
      pagoAtePelasCobrancas([
        { situacao: 'paga', venceEm: new Date('2026-11-10T00:00:00Z') },
        { situacao: 'paga', venceEm: new Date('2026-12-10T00:00:00Z') },
        { situacao: 'recusada', venceEm: new Date('2027-01-10T00:00:00Z') },
      ]),
    ).toEqual(new Date('2027-01-10T00:00:00Z'));
    expect(pagoAtePelasCobrancas([{ situacao: 'agendada', venceEm: new Date() }])).toBeNull();
  });
});
