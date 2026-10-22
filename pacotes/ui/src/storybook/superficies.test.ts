import { describe, expect, it } from 'vitest';
import { exigirSuperficie, superficiesDaHistoria } from './superficies.ts';

describe('superfícies das histórias', () => {
  it('lê só as tags de superfície', () => {
    expect(superficiesDaHistoria(['dev', 'test', 'painel', 'tv'])).toEqual(['painel', 'tv']);
  });

  it('falha se a história não tem nenhuma das tags', () => {
    expect(() => {
      exigirSuperficie('Painel/Tabela', 'Vazia', ['dev', 'test', 'autodocs']);
    }).toThrow(/cardapio, painel ou tv/u);
  });

  it('passa com uma tag', () => {
    expect(() => {
      exigirSuperficie('Cardapio/CartaoPrato', 'Normal', ['cardapio']);
    }).not.toThrow();
  });
});
