const MAXIMO_DE_TERMOS = 6;
const TAMANHO_MAXIMO_DO_TERMO = 40;

export function termosDeBusca(texto: string): readonly string[] {
  const termos = texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((termo) => termo !== '')
    .map((termo) => termo.slice(0, TAMANHO_MAXIMO_DO_TERMO));
  return [...new Set(termos)].slice(0, MAXIMO_DE_TERMOS);
}
