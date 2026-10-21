import { describe, expect, it } from 'vitest';
import { ErroAplicacao } from './erro-aplicacao.ts';
import { ErroInvarianteDominio } from './erro-invariante-dominio.ts';

describe('ErroAplicacao', () => {
  const contexto = {
    modulo: 'pedidos',
    casoDeUso: 'CriarPedido',
    restauranteId: '0190a1b2-0000-7000-8000-000000000001',
    entidade: 'pedido',
    entidadeId: '0190a1b2-0000-7000-8000-000000000002',
    dados: { situacao: 'aberto' },
  };

  it('usa o nome da subclasse', () => {
    const erro = new ErroInvarianteDominio('PEDIDO_TOTAL_NEGATIVO', 'Total negativo', contexto);

    expect(erro.name).toBe('ErroInvarianteDominio');
    expect(erro).toBeInstanceOf(ErroAplicacao);
    expect(erro).toBeInstanceOf(Error);
  });

  it('preserva a causa e o contexto', () => {
    const causa = new Error('falha original');
    const erro = new ErroAplicacao('PEDIDO_GRAVAR_FALHOU', 'Não gravou', contexto, causa);

    expect(erro.cause).toBe(causa);
    expect(erro.contexto).toEqual(contexto);
    expect(erro.codigo).toBe('PEDIDO_GRAVAR_FALHOU');
    expect(erro.message).toBe('Não gravou');
  });

  it('não define causa quando não recebe uma', () => {
    expect('cause' in new ErroAplicacao('PEDIDO_GRAVAR_FALHOU', 'Não gravou', contexto)).toBe(false);
  });
});
