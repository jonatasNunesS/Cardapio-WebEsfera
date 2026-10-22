export interface GeradorDeSegredos {
  token(): string;
  resumo(valor: string): string;
}
