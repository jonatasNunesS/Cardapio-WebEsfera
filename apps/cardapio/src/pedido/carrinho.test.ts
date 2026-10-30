import { describe, expect, it } from 'vitest';
import {
  adicionar,
  aposCriado,
  aposRecusa,
  CARRINHO_VAZIO,
  criarCarrinho,
  mudarLinha,
  novaChave,
  QUANTIDADE_MAXIMA,
} from './carrinho.ts';

class Memoria implements Storage {
  private readonly dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  clear() {
    this.dados.clear();
  }
  getItem(chave: string) {
    return this.dados.get(chave) ?? null;
  }
  key(indice: number) {
    return [...this.dados.keys()][indice] ?? null;
  }
  removeItem(chave: string) {
    this.dados.delete(chave);
  }
  setItem(chave: string, valor: string) {
    this.dados.set(chave, valor);
  }
}

describe('carrinho do cliente', () => {
  it('adicionar soma na linha sem observação e troca a chave', () => {
    const um = adicionar(CARRINHO_VAZIO, 'picanha', 'k1');
    const dois = adicionar(um, 'picanha', 'k2');

    expect(dois).toEqual({
      chave: 'k2',
      linhas: [{ pratoId: 'picanha', quantidade: 2, observacao: '' }],
      pedidos: [],
    });
  });

  it('com observação vira outra linha; a quantidade para no máximo', () => {
    const comObs = mudarLinha(
      adicionar(CARRINHO_VAZIO, 'picanha', 'k1'),
      0,
      { observacao: 'ao ponto' },
      'k2',
    );
    const outra = adicionar(comObs, 'picanha', 'k3');
    const cheio = mudarLinha(outra, 1, { quantidade: QUANTIDADE_MAXIMA }, 'k4');

    expect(outra.linhas).toHaveLength(2);
    expect(adicionar(cheio, 'picanha', 'k5').linhas[1]?.quantidade).toBe(QUANTIDADE_MAXIMA);
  });

  it('quantidade zero tira a linha; carrinho vazio fica sem chave', () => {
    const vazio = mudarLinha(adicionar(CARRINHO_VAZIO, 'suco', 'k1'), 0, { quantidade: 0 }, 'k2');
    expect(vazio).toEqual(CARRINHO_VAZIO);
  });

  it('criado limpa o carrinho e lembra o pedido; recusa troca a chave e mantém os itens', () => {
    const cheio = adicionar(CARRINHO_VAZIO, 'suco', 'k1');

    expect(aposCriado(cheio, { id: 'p1', numero: 7 })).toEqual({
      chave: null,
      linhas: [],
      pedidos: [{ id: 'p1', numero: 7 }],
    });
    expect(aposRecusa(cheio, 'k9')).toEqual({ ...cheio, chave: 'k9' });
  });

  it('a chave é um uuid v7 novo a cada vez', () => {
    const [a, b] = [novaChave(), novaChave()];
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });

  it('o carrinho sobrevive a recarregar a página (fica no aparelho)', () => {
    const memoria = new Memoria();
    const primeiro = criarCarrinho('carrinho:brasa:1', () => memoria);
    primeiro.mudar((estado) => adicionar(estado, 'suco', 'k1'));

    expect(criarCarrinho('carrinho:brasa:1', () => memoria).ler()).toEqual(primeiro.ler());
    expect(criarCarrinho('carrinho:brasa:2', () => memoria).ler()).toEqual(CARRINHO_VAZIO);
  });
});
