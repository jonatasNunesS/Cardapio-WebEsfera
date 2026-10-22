import { CODIGOS } from '@cardapio/dominio';
import { ErroEstadoInconsistente } from '../../compartilhado/erros/erro-estado-inconsistente.ts';
import type { AutenticadorTotp } from '../portas/autenticador-totp.ts';
import type { Cifra } from '../portas/cifra.ts';
import type { RepositorioDeAdmins } from '../portas/repositorio-de-admins.ts';

export interface DependenciasDeIniciarCadastro {
  readonly admins: RepositorioDeAdmins;
  readonly totp: AutenticadorTotp;
  readonly cifra: Cifra;
  readonly rotuloDoTotp: string;
}

export interface CadastroIniciado {
  readonly segredo: string;
  readonly endereco: string;
}

export async function iniciarCadastroSegundoFatorAdmin(
  dependencias: DependenciasDeIniciarCadastro,
  administradorId: string,
): Promise<CadastroIniciado> {
  const segredo = dependencias.totp.gerarSegredo();
  const iniciado = await dependencias.admins.iniciarCadastroDoSegundoFator(
    administradorId,
    dependencias.cifra.cifrar(segredo),
  );
  if (!iniciado) {
    throw new ErroEstadoInconsistente(
      CODIGOS.ADMIN_SEGUNDO_FATOR_CADASTRO_RECUSADO,
      'O cadastro do segundo fator foi recusado para uma sessão de cadastro',
      {
        modulo: 'admin',
        casoDeUso: 'CadastrarSegundoFatorAdmin',
        entidade: 'administrador',
        entidadeId: administradorId,
      },
    );
  }
  return { segredo, endereco: dependencias.totp.enderecoDeCadastro(segredo, dependencias.rotuloDoTotp) };
}
