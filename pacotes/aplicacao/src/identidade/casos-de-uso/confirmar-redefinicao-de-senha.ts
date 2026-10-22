import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import type { CofreDeSenhas } from '../portas/cofre-de-senhas.ts';
import type { GeradorDeSegredos } from '../portas/gerador-de-segredos.ts';
import type { ListaDeSenhasVazadas } from '../portas/lista-de-senhas-vazadas.ts';
import type { RepositorioDeContas } from '../portas/repositorio-de-contas.ts';
import { resumirSenhaNova } from '../senha-nova.ts';

export interface DependenciasDeConfirmarRedefinicao {
  readonly contas: RepositorioDeContas;
  readonly cofre: CofreDeSenhas;
  readonly senhasVazadas: ListaDeSenhasVazadas;
  readonly segredos: GeradorDeSegredos;
  readonly relogio: Relogio;
}

export interface EntradaDeConfirmarRedefinicao {
  readonly token: string;
  readonly senha: string;
}

export async function confirmarRedefinicaoDeSenha(
  dependencias: DependenciasDeConfirmarRedefinicao,
  entrada: EntradaDeConfirmarRedefinicao,
): Promise<Resultado<null, ErroDeNegocio>> {
  const hash = await resumirSenhaNova(dependencias, entrada.senha);
  if (!hash.ok) {
    return hash;
  }
  const redefinida = await dependencias.contas.redefinirSenha(
    dependencias.segredos.resumo(entrada.token),
    hash.valor,
    dependencias.relogio.agora(),
  );
  if (!redefinida) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.SENHA_REDEFINIR_TOKEN_INVALIDO,
        'Este link expirou ou já foi usado. Peça um novo.',
      ),
    );
  }
  return Resultado.ok(null);
}
