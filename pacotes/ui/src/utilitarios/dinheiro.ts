const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarReais(centavos: number): string {
  return REAIS.format(centavos / 100);
}
