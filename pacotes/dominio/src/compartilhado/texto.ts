const SEGMENTADOR = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });

export function contarCaracteres(texto: string): number {
  return Array.from(SEGMENTADOR.segment(texto)).length;
}
