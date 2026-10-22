import { ehEmailValido, normalizarEmail } from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import type { EnviadorDeEmail } from '../portas/enviador-de-email.ts';
import type { GeradorDeSegredos } from '../portas/gerador-de-segredos.ts';
import type { RepositorioDeContas } from '../portas/repositorio-de-contas.ts';

export const VALIDADE_DO_TOKEN_DE_REDEFINICAO_MS = 30 * 60_000;

export interface DependenciasDePedirRedefinicao {
  readonly contas: RepositorioDeContas;
  readonly segredos: GeradorDeSegredos;
  readonly email: EnviadorDeEmail;
  readonly relogio: Relogio;
  readonly urlDoPainel: string;
}

function mensagem(urlDoPainel: string, token: string): string {
  return [
    'Recebemos um pedido para redefinir a senha do seu Cardápio WebEsfera.',
    '',
    `Para criar uma senha nova, abra este link em até 30 minutos: ${urlDoPainel}/redefinir-senha#${token}`,
    '',
    'Se não foi você, ignore este e-mail. Sua senha continua a mesma.',
  ].join('\n');
}

export async function pedirRedefinicaoDeSenha(
  dependencias: DependenciasDePedirRedefinicao,
  emailInformado: string,
): Promise<void> {
  const email = normalizarEmail(emailInformado);
  if (!ehEmailValido(email)) {
    return;
  }
  const agora = dependencias.relogio.agora();
  const token = dependencias.segredos.token();
  const existe = await dependencias.contas.criarTokenDeRedefinicao({
    email,
    hashToken: dependencias.segredos.resumo(token),
    agora,
    expiraEm: new Date(agora.getTime() + VALIDADE_DO_TOKEN_DE_REDEFINICAO_MS),
  });
  if (existe) {
    await dependencias.email.enviar({
      para: email,
      assunto: 'Redefinir a senha',
      texto: mensagem(dependencias.urlDoPainel, token),
    });
  }
}
