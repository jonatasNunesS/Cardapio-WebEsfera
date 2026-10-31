import { describe, expect, it } from 'vitest';
import {
  diasRestantesDeTeste,
  podeReceberPedidos,
  situacaoExibida,
  validarMotivoDoAdmin,
  validarSlugDoAdmin,
} from './acesso-do-restaurante.ts';

describe('acesso do restaurante', () => {
  it('suspenso segue a regra da inadimplência: não recebe pedidos em nenhuma situação', () => {
    for (const situacao of ['teste', 'ativo', 'carencia', 'inadimplente', 'cancelado'] as const) {
      expect(podeReceberPedidos({ situacao, suspenso: true })).toBe(false);
    }
  });

  it('sem suspensão, vale a régua de cobrança', () => {
    expect(podeReceberPedidos({ situacao: 'teste', suspenso: false })).toBe(true);
    expect(podeReceberPedidos({ situacao: 'carencia', suspenso: false })).toBe(true);
    expect(podeReceberPedidos({ situacao: 'inadimplente', suspenso: false })).toBe(false);
  });

  it('a situação exibida mostra suspenso por cima da situação de cobrança', () => {
    expect(situacaoExibida({ situacao: 'ativo', suspenso: true })).toBe('suspenso');
    expect(situacaoExibida({ situacao: 'ativo', suspenso: false })).toBe('ativo');
  });

  it('dias de teste arredondam para cima e não ficam negativos', () => {
    const agora = new Date('2026-10-31T12:00:00Z');
    expect(diasRestantesDeTeste(new Date('2026-11-03T11:00:00Z'), agora)).toBe(3);
    expect(diasRestantesDeTeste(new Date('2026-10-30T12:00:00Z'), agora)).toBe(0);
  });

  it('o motivo do admin é obrigatório e limitado', () => {
    expect(validarMotivoDoAdmin('  falta de  pagamento ')).toEqual({ ok: true, valor: 'falta de pagamento' });
    expect(validarMotivoDoAdmin('ok').ok).toBe(false);
    expect(validarMotivoDoAdmin('x'.repeat(501)).ok).toBe(false);
  });

  it('o slug do admin segue o formato e evita palavras reservadas', () => {
    expect(validarSlugDoAdmin(' Brasa-Centro ')).toEqual({ ok: true, valor: 'brasa-centro' });
    expect(validarSlugDoAdmin('admin').ok).toBe(false);
    expect(validarSlugDoAdmin('com espaco').ok).toBe(false);
  });
});
