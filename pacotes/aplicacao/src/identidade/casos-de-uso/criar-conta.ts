import {
  CODIGOS,
  contarCaracteres,
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
import type { ListaDeSenhasVazadas } from '../portas/lista-de-senhas-vazadas.ts';
import type { RepositorioDeContas } from '../portas/repositorio-de-contas.ts';
import type { RepositorioDeSessoes } from '../portas/repositorio-de-sessoes.ts';
import { resumirSenhaNova } from '../senha-nova.ts';

export const TAMANHO_MAXIMO_DO_NOME_DA_PESSOA = 120;

export interface DependenciasDeCriarConta {
  readonly contas: RepositorioDeContas;
  readonly sessoes: RepositorioDeSessoes;
  readonly cofre: CofreDeSenhas;
  readonly senhasVazadas: ListaDeSenhasVazadas;
  readonly segredos: GeradorDeSegredos;
  readonly relogio: Relogio;
}

export interface EntradaDeCriarConta {
  readonly nome: string;
  readonly email: string;
  readonly senha: string;
}

function validarNomeEEmail(entrada: EntradaDeCriarConta): ErroDeNegocio | null {
  const tamanho = contarCaracteres(entrada.nome.trim());
  if (tamanho === 0 || tamanho > TAMANHO_MAXIMO_DO_NOME_DA_PESSOA) {
    return criarErroDeNegocio(CODIGOS.CONTA_CRIAR_NOME_INVALIDO, 'Informe o seu nome.', { campo: 'nome' });
  }
  if (!ehEmailValido(entrada.email)) {
    return criarErroDeNegocio(CODIGOS.CONTA_CRIAR_EMAIL_INVALIDO, 'Informe um e-mail válido.', {
      campo: 'email',
    });
  }
  return null;
}

export async function criarConta(
  dependencias: DependenciasDeCriarConta,
  entrada: EntradaDeCriarConta,
): Promise<Resultado<SessaoAberta, ErroDeNegocio>> {
  const invalido = validarNomeEEmail(entrada);
  if (invalido !== null) {
    return Resultado.falha(invalido);
  }
  const hash = await resumirSenhaNova(dependencias, entrada.senha);
  if (!hash.ok) {
    return hash;
  }
  const usuarioId = await dependencias.contas.criarUsuario(
    entrada.nome.trim(),
    normalizarEmail(entrada.email),
    hash.valor,
  );
  if (usuarioId === null) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.CONTA_CRIAR_EMAIL_INDISPONIVEL,
        'Não foi possível criar a conta com esse e-mail. Se já tem conta, entre ou redefina a senha.',
        { campo: 'email' },
      ),
    );
  }
  const sessao = await abrirSessao(dependencias, {
    publico: 'painel',
    titularId: usuarioId,
    restauranteId: null,
    nivel: 'completa',
    agora: dependencias.relogio.agora(),
    casoDeUso: 'CriarConta',
  });
  return Resultado.ok(sessao);
}
