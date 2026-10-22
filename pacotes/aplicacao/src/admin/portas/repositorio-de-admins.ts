export interface CredenciaisDeAdmin {
  readonly administradorId: string;
  readonly hashSenha: string;
  readonly trocaDeSenhaObrigatoria: boolean;
  readonly segundoFatorCadastrado: boolean;
}

export interface SegundoFatorGuardado {
  readonly segredoCifrado: string | null;
  readonly segredoPendenteCifrado: string | null;
  readonly ultimoPasso: number;
}

export interface ConclusaoDoCadastro {
  readonly administradorId: string;
  readonly passo: number;
  readonly hashSenha: string;
  readonly hashesDeRecuperacao: readonly string[];
  readonly agora: Date;
}

export interface RepositorioDeAdmins {
  buscar(email: string): Promise<CredenciaisDeAdmin | null>;
  buscarSegundoFator(administradorId: string): Promise<SegundoFatorGuardado | null>;
  iniciarCadastroDoSegundoFator(administradorId: string, segredoPendenteCifrado: string): Promise<boolean>;
  concluirCadastroDoSegundoFator(conclusao: ConclusaoDoCadastro): Promise<boolean>;
  usarPasso(administradorId: string, passo: number): Promise<boolean>;
  usarCodigoDeRecuperacao(administradorId: string, hashCodigo: string, agora: Date): Promise<boolean>;
}
