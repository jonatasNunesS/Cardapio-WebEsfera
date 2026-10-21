import { describe, expect, it } from 'vitest';
import { CODIGOS, validarCodigos } from './codigos.ts';

describe('códigos de erro', () => {
  it('todos os códigos do projeto são únicos e seguem MODULO_ACAO_MOTIVO', () => {
    expect(validarCodigos(CODIGOS)).toEqual([]);
  });

  it('acusa código repetido', () => {
    const problemas = validarCodigos({
      PEDIDO_CRIAR_DUPLICADO: 'PEDIDO_CRIAR_DUPLICADO',
      OUTRO: 'PEDIDO_CRIAR_DUPLICADO',
    });

    expect(problemas).toContain('PEDIDO_CRIAR_DUPLICADO: código repetido');
  });

  it('acusa código fora do padrão', () => {
    expect(validarCodigos({ pedidoFalhou: 'pedidoFalhou' })).toContain(
      'pedidoFalhou: fora do padrão MODULO_ACAO_MOTIVO',
    );
    expect(validarCodigos({ PEDIDO_FALHOU: 'PEDIDO_FALHOU' })).toContain(
      'PEDIDO_FALHOU: fora do padrão MODULO_ACAO_MOTIVO',
    );
  });
});
