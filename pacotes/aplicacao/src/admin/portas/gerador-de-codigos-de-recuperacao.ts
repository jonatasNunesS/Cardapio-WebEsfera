export interface GeradorDeCodigosDeRecuperacao {
  gerar(quantidade: number): readonly string[];
  normalizar(codigo: string): string;
}
