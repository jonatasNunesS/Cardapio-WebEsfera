export interface CofreDeSenhas {
  resumir(senha: string): Promise<string>;
  conferir(hash: string | null, senha: string): Promise<boolean>;
}
