import { describe, expect, it } from 'vitest';
import {
  DIA_DA_CARENCIA,
  DIA_DA_INADIMPLENCIA,
  diaDeAtraso,
  podeReceberPedido,
  situacaoPelaRegua,
  type EstadoDaCobranca,
} from './regua.ts';

const SAO_PAULO = 'America/Sao_Paulo';
const fimDoTeste = new Date('2026-11-10T15:00:00Z');

function estado(mudancas: Partial<EstadoDaCobranca> = {}): EstadoDaCobranca {
  return {
    situacaoAtual: 'teste',
    testeTerminaEm: fimDoTeste,
    pagoAte: null,
    fusoHorario: SAO_PAULO,
    ...mudancas,
  };
}

describe('régua da inadimplência', () => {
  it('os prazos são carência do dia 1 ao 14 e inadimplência a partir do dia 15', () => {
    expect(DIA_DA_CARENCIA).toBe(1);
    expect(DIA_DA_INADIMPLENCIA).toBe(15);
  });

  it('dentro do teste, o restaurante segue em teste', () => {
    expect(situacaoPelaRegua(estado(), new Date('2026-11-10T14:59:59Z'))).toBe('teste');
  });

  it('o teste vencido entra em carência no mesmo dia e fica nela até o dia 14', () => {
    expect(situacaoPelaRegua(estado(), new Date('2026-11-10T15:00:00Z'))).toBe('carencia');
    expect(situacaoPelaRegua(estado(), new Date('2026-11-23T23:59:00-03:00'))).toBe('carencia');
  });

  it('no dia 15, pelo fuso do restaurante, vira inadimplente', () => {
    expect(situacaoPelaRegua(estado(), new Date('2026-11-24T00:00:00-03:00'))).toBe('inadimplente');
    expect(situacaoPelaRegua(estado(), new Date('2026-11-24T02:59:00Z'))).toBe('carencia');
  });

  it('o mesmo instante conta outro dia em outro fuso', () => {
    const instante = new Date('2026-11-24T02:30:00Z');
    expect(diaDeAtraso(fimDoTeste, instante, SAO_PAULO)).toBe(14);
    expect(diaDeAtraso(fimDoTeste, instante, 'Europe/Lisbon')).toBe(15);
  });

  it('com pagamento cobrindo o período, fica ativo; o pagamento reativa quem estava inadimplente', () => {
    const pago = estado({ situacaoAtual: 'inadimplente', pagoAte: new Date('2026-12-26T15:00:00Z') });
    expect(situacaoPelaRegua(pago, new Date('2026-11-26T15:00:00Z'))).toBe('ativo');
  });

  it('pagamento vencido segue a mesma régua a partir do fim da cobertura', () => {
    const pagoAte = new Date('2026-12-26T15:00:00Z');
    const atrasado = estado({ situacaoAtual: 'ativo', pagoAte });
    expect(situacaoPelaRegua(atrasado, new Date('2026-12-27T12:00:00Z'))).toBe('carencia');
    expect(situacaoPelaRegua(atrasado, new Date('2027-01-09T12:00:00Z'))).toBe('inadimplente');
  });

  it('cancelado nunca sai de cancelado pela régua', () => {
    expect(
      situacaoPelaRegua(estado({ situacaoAtual: 'cancelado', pagoAte: new Date('2030-01-01') }), fimDoTeste),
    ).toBe('cancelado');
  });

  it('pedidos ficam suspensos só para inadimplente e cancelado', () => {
    expect(podeReceberPedido('teste')).toBe(true);
    expect(podeReceberPedido('ativo')).toBe(true);
    expect(podeReceberPedido('carencia')).toBe(true);
    expect(podeReceberPedido('inadimplente')).toBe(false);
    expect(podeReceberPedido('cancelado')).toBe(false);
  });
});
