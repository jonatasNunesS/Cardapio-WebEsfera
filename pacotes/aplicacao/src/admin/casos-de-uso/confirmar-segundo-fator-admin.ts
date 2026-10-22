import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import { abrirSessao, type SessaoAberta } from '../../identidade/abrir-sessao.ts';
import { erroDeBloqueio } from '../../identidade/casos-de-uso/entrar.ts';
import type { GeradorDeSegredos } from '../../identidade/portas/gerador-de-segredos.ts';
import type { RegistroDeTentativas } from '../../identidade/portas/registro-de-tentativas.ts';
import type { RepositorioDeSessoes } from '../../identidade/portas/repositorio-de-sessoes.ts';
import { alvoDeLogin, bloqueioAtual, registrarFalhas } from '../../identidade/protecao-de-login.ts';
import type { AutenticadorTotp } from '../portas/autenticador-totp.ts';
import type { Cifra } from '../portas/cifra.ts';
import type { GeradorDeCodigosDeRecuperacao } from '../portas/gerador-de-codigos-de-recuperacao.ts';
import type { RepositorioDeAdmins } from '../portas/repositorio-de-admins.ts';

export interface DependenciasDeConfirmarSegundoFator {
  readonly admins: RepositorioDeAdmins;
  readonly sessoes: RepositorioDeSessoes;
  readonly tentativas: RegistroDeTentativas;
  readonly totp: AutenticadorTotp;
  readonly cifra: Cifra;
  readonly recuperacao: GeradorDeCodigosDeRecuperacao;
  readonly segredos: GeradorDeSegredos;
  readonly relogio: Relogio;
}

export interface EntradaDeConfirmarSegundoFator {
  readonly administradorId: string;
  readonly hashDaSessaoParcial: string;
  readonly codigo: string;
}

const CODIGO_TOTP = /^\d{6}$/;

async function codigoValido(
  dependencias: DependenciasDeConfirmarSegundoFator,
  entrada: EntradaDeConfirmarSegundoFator,
  agora: Date,
): Promise<boolean> {
  const codigo = entrada.codigo.replace(/\s/g, '');
  if (!CODIGO_TOTP.test(codigo)) {
    const hash = dependencias.segredos.resumo(dependencias.recuperacao.normalizar(codigo));
    return dependencias.admins.usarCodigoDeRecuperacao(entrada.administradorId, hash, agora);
  }
  const guardado = await dependencias.admins.buscarSegundoFator(entrada.administradorId);
  if (guardado?.segredoCifrado == null) {
    return false;
  }
  const segredo = dependencias.cifra.decifrar(guardado.segredoCifrado);
  const passo = await dependencias.totp.passoDoCodigo(segredo, codigo, agora);
  return passo !== null && (await dependencias.admins.usarPasso(entrada.administradorId, passo));
}

export async function confirmarSegundoFatorAdmin(
  dependencias: DependenciasDeConfirmarSegundoFator,
  entrada: EntradaDeConfirmarSegundoFator,
): Promise<Resultado<SessaoAberta, ErroDeNegocio>> {
  const agora = dependencias.relogio.agora();
  const alvos = [alvoDeLogin(dependencias.segredos, 'segundo_fator', entrada.administradorId)];
  const bloqueio = await bloqueioAtual(dependencias.tentativas, 'admin', alvos, agora);
  if (bloqueio !== null) {
    return Resultado.falha(erroDeBloqueio(CODIGOS.ADMIN_ENTRAR_BLOQUEADA, bloqueio));
  }
  if (!(await codigoValido(dependencias, entrada, agora))) {
    await registrarFalhas(dependencias.tentativas, 'admin', alvos, agora);
    return Resultado.falha(criarErroDeNegocio(CODIGOS.ADMIN_ENTRAR_CODIGO_INVALIDO, 'Código inválido.'));
  }
  await dependencias.tentativas.limpar('admin', alvos[0]?.alvo ?? '');
  await dependencias.sessoes.revogar(entrada.hashDaSessaoParcial, agora);
  const sessao = await abrirSessao(dependencias, {
    publico: 'admin',
    titularId: entrada.administradorId,
    restauranteId: null,
    nivel: 'completa',
    agora,
    casoDeUso: 'ConfirmarSegundoFatorAdmin',
  });
  return Resultado.ok(sessao);
}
