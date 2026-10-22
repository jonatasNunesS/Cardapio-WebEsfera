import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import { abrirSessao, type SessaoAberta } from '../../identidade/abrir-sessao.ts';
import type { CofreDeSenhas } from '../../identidade/portas/cofre-de-senhas.ts';
import type { GeradorDeSegredos } from '../../identidade/portas/gerador-de-segredos.ts';
import type { ListaDeSenhasVazadas } from '../../identidade/portas/lista-de-senhas-vazadas.ts';
import type { RepositorioDeSessoes } from '../../identidade/portas/repositorio-de-sessoes.ts';
import { resumirSenhaNova } from '../../identidade/senha-nova.ts';
import type { AutenticadorTotp } from '../portas/autenticador-totp.ts';
import type { Cifra } from '../portas/cifra.ts';
import type { GeradorDeCodigosDeRecuperacao } from '../portas/gerador-de-codigos-de-recuperacao.ts';
import type { RepositorioDeAdmins } from '../portas/repositorio-de-admins.ts';

export const QUANTIDADE_DE_CODIGOS_DE_RECUPERACAO = 10;

export interface DependenciasDeConcluirCadastro {
  readonly admins: RepositorioDeAdmins;
  readonly sessoes: RepositorioDeSessoes;
  readonly totp: AutenticadorTotp;
  readonly cifra: Cifra;
  readonly recuperacao: GeradorDeCodigosDeRecuperacao;
  readonly cofre: CofreDeSenhas;
  readonly senhasVazadas: ListaDeSenhasVazadas;
  readonly segredos: GeradorDeSegredos;
  readonly relogio: Relogio;
}

export interface EntradaDeConcluirCadastro {
  readonly administradorId: string;
  readonly codigo: string;
  readonly senhaNova: string;
}

export interface CadastroConcluido extends SessaoAberta {
  readonly codigosDeRecuperacao: readonly string[];
}

const codigoInvalido = () =>
  Resultado.falha(
    criarErroDeNegocio(
      CODIGOS.ADMIN_SEGUNDO_FATOR_CODIGO_INVALIDO,
      'Código inválido. Confira o horário do celular.',
      {
        campo: 'codigo',
      },
    ),
  );

async function passoDoCodigoPendente(
  dependencias: DependenciasDeConcluirCadastro,
  entrada: EntradaDeConcluirCadastro,
  agora: Date,
): Promise<number | null> {
  const guardado = await dependencias.admins.buscarSegundoFator(entrada.administradorId);
  if (guardado?.segredoPendenteCifrado == null) {
    return null;
  }
  const segredo = dependencias.cifra.decifrar(guardado.segredoPendenteCifrado);
  return dependencias.totp.passoDoCodigo(segredo, entrada.codigo.replace(/\s/g, ''), agora);
}

export async function concluirCadastroSegundoFatorAdmin(
  dependencias: DependenciasDeConcluirCadastro,
  entrada: EntradaDeConcluirCadastro,
): Promise<Resultado<CadastroConcluido, ErroDeNegocio>> {
  const agora = dependencias.relogio.agora();
  const hashSenha = await resumirSenhaNova(dependencias, entrada.senhaNova);
  if (!hashSenha.ok) {
    return hashSenha;
  }
  const passo = await passoDoCodigoPendente(dependencias, entrada, agora);
  if (passo === null) {
    return codigoInvalido();
  }
  const codigos = dependencias.recuperacao.gerar(QUANTIDADE_DE_CODIGOS_DE_RECUPERACAO);
  const concluido = await dependencias.admins.concluirCadastroDoSegundoFator({
    administradorId: entrada.administradorId,
    passo,
    hashSenha: hashSenha.valor,
    hashesDeRecuperacao: codigos.map((codigo) =>
      dependencias.segredos.resumo(dependencias.recuperacao.normalizar(codigo)),
    ),
    agora,
  });
  if (!concluido) {
    return codigoInvalido();
  }
  const sessao = await abrirSessao(dependencias, {
    publico: 'admin',
    titularId: entrada.administradorId,
    restauranteId: null,
    nivel: 'completa',
    agora,
    casoDeUso: 'CadastrarSegundoFatorAdmin',
  });
  return Resultado.ok({ ...sessao, codigosDeRecuperacao: codigos });
}
