import {
  CODIGOS,
  criarErroDeNegocio,
  ehEmailValido,
  normalizarEmail,
  Resultado,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import { abrirSessao, type SessaoAberta } from '../../identidade/abrir-sessao.ts';
import { erroDeBloqueio } from '../../identidade/casos-de-uso/entrar.ts';
import type { CofreDeSenhas } from '../../identidade/portas/cofre-de-senhas.ts';
import type { GeradorDeSegredos } from '../../identidade/portas/gerador-de-segredos.ts';
import type { SinaisDeSeguranca } from '../../identidade/portas/sinais-de-seguranca.ts';
import type { RegistroDeTentativas } from '../../identidade/portas/registro-de-tentativas.ts';
import type { RepositorioDeSessoes } from '../../identidade/portas/repositorio-de-sessoes.ts';
import { alvoDeLogin, bloqueioAtual, registrarFalhas } from '../../identidade/protecao-de-login.ts';
import type { RepositorioDeAdmins } from '../portas/repositorio-de-admins.ts';

export interface DependenciasDeEntrarComoAdmin {
  readonly admins: RepositorioDeAdmins;
  readonly sessoes: RepositorioDeSessoes;
  readonly tentativas: RegistroDeTentativas;
  readonly sinais: SinaisDeSeguranca;
  readonly cofre: CofreDeSenhas;
  readonly segredos: GeradorDeSegredos;
  readonly relogio: Relogio;
}

export interface EntradaDeEntrarComoAdmin {
  readonly email: string;
  readonly senha: string;
  readonly ip: string;
}

export interface EntradaParcialDoAdmin extends SessaoAberta {
  readonly proximoPasso: 'segundo_fator' | 'cadastro';
}

export async function entrarComoAdmin(
  dependencias: DependenciasDeEntrarComoAdmin,
  entrada: EntradaDeEntrarComoAdmin,
): Promise<Resultado<EntradaParcialDoAdmin, ErroDeNegocio>> {
  const agora = dependencias.relogio.agora();
  const email = normalizarEmail(entrada.email);
  const alvoDoEmail = alvoDeLogin(dependencias.segredos, 'email', email);
  const alvos = [alvoDoEmail, alvoDeLogin(dependencias.segredos, 'ip', entrada.ip)];
  const bloqueio = await bloqueioAtual(dependencias.tentativas, 'admin', alvos, agora);
  if (bloqueio !== null) {
    return Resultado.falha(erroDeBloqueio(CODIGOS.ADMIN_ENTRAR_BLOQUEADA, bloqueio));
  }
  const admin = ehEmailValido(email) ? await dependencias.admins.buscar(email) : null;
  const confere = await dependencias.cofre.conferir(admin?.hashSenha ?? null, entrada.senha);
  if (admin === null || !confere) {
    await registrarFalhas(dependencias, { publico: 'admin', etapa: 'senha', alvos, agora });
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.ADMIN_ENTRAR_CREDENCIAIS_INVALIDAS, 'E-mail ou senha incorretos.'),
    );
  }
  await dependencias.tentativas.limpar('admin', alvoDoEmail.alvo);
  const proximoPasso = admin.trocaDeSenhaObrigatoria ? 'cadastro' : 'segundo_fator';
  const sessao = await abrirSessao(dependencias, {
    publico: 'admin',
    titularId: admin.administradorId,
    restauranteId: null,
    nivel: proximoPasso,
    agora,
    casoDeUso: 'EntrarComoAdmin',
  });
  return Resultado.ok({ ...sessao, proximoPasso });
}
