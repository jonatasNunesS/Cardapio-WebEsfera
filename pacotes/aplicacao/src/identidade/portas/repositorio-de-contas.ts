import type { PapelDeAcesso } from '../../compartilhado/acesso.ts';

export type PapelNoRestaurante = PapelDeAcesso;

export interface Credenciais {
  readonly usuarioId: string;
  readonly hashSenha: string;
}

export interface Vinculo {
  readonly restauranteId: string;
  readonly papel: PapelNoRestaurante;
}

export interface PedidoDeRedefinicao {
  readonly email: string;
  readonly hashToken: string;
  readonly agora: Date;
  readonly expiraEm: Date;
}

export interface RepositorioDeContas {
  criarUsuario(nome: string, email: string, hashSenha: string): Promise<string | null>;
  buscarCredenciais(email: string): Promise<Credenciais | null>;
  listarVinculos(usuarioId: string): Promise<readonly Vinculo[]>;
  criarTokenDeRedefinicao(pedido: PedidoDeRedefinicao): Promise<boolean>;
  redefinirSenha(hashToken: string, hashSenha: string, agora: Date): Promise<boolean>;
}
