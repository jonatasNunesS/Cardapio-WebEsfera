export const ESPACO_DA_ORDEM = 1024;
const LIMITE_DA_ORDEM = 2_000_000_000;

export interface ItemOrdenado {
  readonly id: string;
  readonly ordem: number;
}

function emOrdem(itens: readonly ItemOrdenado[]): ItemOrdenado[] {
  return [...itens].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
}

export function ordemNoFim(itens: readonly ItemOrdenado[]): number {
  return itens.reduce((maior, item) => Math.max(maior, item.ordem), 0) + ESPACO_DA_ORDEM;
}

function ordemEntre(anterior: number | undefined, seguinte: number | undefined): number | undefined {
  if (anterior === undefined && seguinte === undefined) {
    return ESPACO_DA_ORDEM;
  }
  const candidata =
    anterior === undefined
      ? (seguinte ?? 0) - ESPACO_DA_ORDEM
      : seguinte === undefined
        ? anterior + ESPACO_DA_ORDEM
        : seguinte - anterior >= 2
          ? Math.floor((anterior + seguinte) / 2)
          : undefined;
  return candidata !== undefined && Math.abs(candidata) <= LIMITE_DA_ORDEM ? candidata : undefined;
}

function renumerar(original: readonly ItemOrdenado[], nova: readonly ItemOrdenado[]): ItemOrdenado[] {
  const antes = new Map(original.map((item) => [item.id, item.ordem]));
  return nova
    .map((item, posicao) => ({ id: item.id, ordem: (posicao + 1) * ESPACO_DA_ORDEM }))
    .filter((item) => antes.get(item.id) !== item.ordem);
}

export function planejarMovimento(
  itens: readonly ItemOrdenado[],
  id: string,
  destino: number,
): readonly ItemOrdenado[] {
  const atual = emOrdem(itens);
  const origem = atual.findIndex((item) => item.id === id);
  const movido = atual[origem];
  if (movido === undefined) {
    return [];
  }
  const restantes = atual.filter((item) => item.id !== id);
  const posicao = Math.max(0, Math.min(Math.trunc(destino), restantes.length));
  if (posicao === origem) {
    return [];
  }
  const ordem = ordemEntre(restantes[posicao - 1]?.ordem, restantes[posicao]?.ordem);
  if (ordem !== undefined) {
    return [{ id, ordem }];
  }
  return renumerar(atual, [...restantes.slice(0, posicao), movido, ...restantes.slice(posicao)]);
}
