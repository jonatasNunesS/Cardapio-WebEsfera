export interface AutenticadorTotp {
  gerarSegredo(): string;
  enderecoDeCadastro(segredo: string, rotulo: string): string;
  passoDoCodigo(segredo: string, codigo: string, agora: Date): Promise<number | null>;
}
