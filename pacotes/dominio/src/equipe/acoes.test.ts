import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import {
  equipePodeCancelarPedido,
  proximaSituacaoDoChamado,
  proximaSituacaoDoPedido,
  validarMotivoDeCancelamento,
} from './acoes.ts';

describe('ações da equipe', () => {
  it('o pedido avança só na ordem e para no entregue', () => {
    expect(proximaSituacaoDoPedido('enviado')).toBe('em_preparo');
    expect(proximaSituacaoDoPedido('em_preparo')).toBe('pronto');
    expect(proximaSituacaoDoPedido('pronto')).toBe('entregue');
    expect(proximaSituacaoDoPedido('entregue')).toBeNull();
    expect(proximaSituacaoDoPedido('cancelado')).toBeNull();
  });

  it('o chamado é assumido e depois concluído', () => {
    expect(proximaSituacaoDoChamado('aguardando')).toBe('em_atendimento');
    expect(proximaSituacaoDoChamado('em_atendimento')).toBe('concluido');
    expect(proximaSituacaoDoChamado('concluido')).toBeNull();
    expect(proximaSituacaoDoChamado('cancelado')).toBeNull();
  });

  it('a equipe cancela até o pedido ser entregue', () => {
    expect(equipePodeCancelarPedido('pronto')).toBe(true);
    expect(equipePodeCancelarPedido('entregue')).toBe(false);
    expect(equipePodeCancelarPedido('cancelado')).toBe(false);
  });

  it('o motivo é obrigatório, limpo e limitado', () => {
    expect(validarMotivoDeCancelamento('  sem   estoque ')).toEqual({ ok: true, valor: 'sem estoque' });
    expect(validarMotivoDeCancelamento(' ok ')).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_CANCELAR_MOTIVO_INVALIDO },
    });
    expect(validarMotivoDeCancelamento('x'.repeat(201)).ok).toBe(false);
  });
});
