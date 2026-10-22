import {
  CODIGOS,
  criarErroDeNegocio,
  ehEmailValido,
  normalizarEmail,
  Resultado,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import { abrirSessao, type SessaoAberta } from '../abrir-sessao.ts';
import type { CofreDeSenhas } from '../portas/cofre-de-senhas.ts';
import type { GeradorDeSegredos } from '../portas/gerador-de-segredos.ts';
import type { RegistroDeTentativas } from '../portas/registro-de-tentativas.ts';
import type { RepositorioDeContas } from '../portas/repositorio-de-contas.ts';
import type { RepositorioDeSessoes } from '../portas/repositorio-de-sessoes.ts';
import { alvoDeLogin, bloqueioAtual, registrarFalhas } from '../protecao-de-login.ts';

export interface DependenciasDeEntrar {
  readonly contas: RepositorioDeContas;
  readonly sessoes: RepositorioDeSessoes;
  readonly tentativas: RegistroDeTentativas;
  readonly cofre: CofreDeSenhas;
  readonly segredos: GeradorDeSegredos;
  readonly relogio: Relogio;
}

export interface EntradaDeEntrar {
  readonly email: string;
  readonly senha: string;
  readonly ip: string;
}

export interface Entrada extends SessaoAberta {
  readonly restauranteId: string | null;
}

export function erroDeBloqueio(codigo: string, ate: Date): ErroDeNegocio {
  return criarErroDeNegocio(codigo, 'Muitas tentativas. Tente de novo em alguns minutos.', {
    tenteDeNovoEm: ate.toISOString(),
  });
}

export async function entrar(
  dependencias: DependenciasDeEntrar,
  entrada: EntradaDeEntrar,
): Promise<Resultado<Entrada, ErroDeNegocio>> {
  const agora = dependencias.relogio.agora();
  const email = normalizarEmail(entrada.email);
  const alvoDoEmail = alvoDeLogin(dependencias.segredos, 'email', email);
  const alvos = [alvoDoEmail, alvoDeLogin(dependencias.segredos, 'ip', entrada.ip)];
  const bloqueio = await bloqueioAtual(dependencias.tentativas, 'painel', alvos, agora);
  if (bloqueio !== null) {
    return Resultado.falha(erroDeBloqueio(CODIGOS.SESSAO_ENTRAR_BLOQUEADA, bloqueio));
  }
  const credenciais = ehEmailValido(email) ? await dependencias.contas.buscarCredenciais(email) : null;
  const confere = await dependencias.cofre.conferir(credenciais?.hashSenha ?? null, entrada.senha);
  if (credenciais === null || !confere) {
    await registrarFalhas(dependencias.tentativas, 'painel', alvos, agora);
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.SESSAO_ENTRAR_CREDENCIAIS_INVALIDAS, 'E-mail ou senha incorretos.'),
    );
  }
  await dependencias.tentativas.limpar('painel', alvoDoEmail.alvo);
  const [vinculo] = await dependencias.contas.listarVinculos(credenciais.usuarioId);
  const restauranteId = vinculo?.restauranteId ?? null;
  const sessao = await abrirSessao(dependencias, {
    publico: 'painel',
    titularId: credenciais.usuarioId,
    restauranteId,
    nivel: 'completa',
    agora,
    casoDeUso: 'Entrar',
  });
  return Resultado.ok({ ...sessao, restauranteId });
}
