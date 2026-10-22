import { describe, expect, it } from 'vitest';
import { ESPACO_DA_ORDEM, ordemNoFim, planejarMovimento, type ItemOrdenado } from './ordem.ts';

function aplicar(itens: ItemOrdenado[], mudancas: readonly ItemOrdenado[]): ItemOrdenado[] {
  const novas = new Map(mudancas.map((mudanca) => [mudanca.id, mudanca.ordem]));
  return itens.map((item) => ({ id: item.id, ordem: novas.get(item.id) ?? item.ordem }));
}

function sequencia(itens: readonly ItemOrdenado[]): string[] {
  return [...itens].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id)).map((item) => item.id);
}

const INICIAIS: ItemOrdenado[] = ['a', 'b', 'c', 'd', 'e'].map((id, indice) => ({
  id,
  ordem: (indice + 1) * ESPACO_DA_ORDEM,
}));

describe('ordem com espaçamento', () => {
  it('arrastar um item muda só ele', () => {
    const mudancas = planejarMovimento(INICIAIS, 'e', 1);

    expect(mudancas).toEqual([{ id: 'e', ordem: 1536 }]);
    expect(sequencia(aplicar(INICIAIS, mudancas))).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('mover para o começo e para o fim também muda só o item', () => {
    expect(planejarMovimento(INICIAIS, 'c', 0)).toEqual([{ id: 'c', ordem: 0 }]);
    expect(planejarMovimento(INICIAIS, 'a', 10)).toEqual([{ id: 'a', ordem: 6144 }]);
  });

  it('mover para a mesma posição ou um id desconhecido não muda nada', () => {
    expect(planejarMovimento(INICIAIS, 'c', 2)).toEqual([]);
    expect(planejarMovimento(INICIAIS, 'z', 0)).toEqual([]);
  });

  it('a ordem fica estável depois de muitas trocas, e quando o espaço acaba renumera uma vez', () => {
    let itens = INICIAIS;
    let renumeracoes = 0;
    for (let rodada = 0; rodada < 40; rodada += 1) {
      const alvo = rodada % 2 === 0 ? 'e' : 'd';
      const esperada = sequencia(itens).filter((id) => id !== alvo);
      esperada.splice(1, 0, alvo);
      const mudancas = planejarMovimento(itens, alvo, 1);
      renumeracoes += mudancas.length > 1 ? 1 : 0;
      itens = aplicar(itens, mudancas);
      expect(sequencia(itens)).toEqual(esperada);
      expect(new Set(itens.map((item) => item.ordem)).size).toBe(itens.length);
    }
    expect(renumeracoes).toBeGreaterThan(0);
    expect(renumeracoes).toBeLessThan(10);
  });

  it('item novo entra no fim', () => {
    expect(ordemNoFim(INICIAIS)).toBe(6 * ESPACO_DA_ORDEM);
    expect(ordemNoFim([])).toBe(ESPACO_DA_ORDEM);
  });
});
