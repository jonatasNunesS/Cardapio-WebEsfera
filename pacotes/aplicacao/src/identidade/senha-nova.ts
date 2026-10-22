import {
  CODIGOS,
  criarErroDeNegocio,
  Resultado,
  validarFormatoDaSenha,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { CofreDeSenhas } from './portas/cofre-de-senhas.ts';
import type { ListaDeSenhasVazadas } from './portas/lista-de-senhas-vazadas.ts';

export function conferirSenhaNova(
  senhasVazadas: ListaDeSenhasVazadas,
  senha: string,
): Resultado<string, ErroDeNegocio> {
  const formato = validarFormatoDaSenha(senha);
  if (!formato.ok) {
    return formato;
  }
  if (senhasVazadas.contem(senha)) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.CONTA_SENHA_VAZADA,
        'Essa senha aparece em vazamentos conhecidos. Escolha outra.',
        { campo: 'senha' },
      ),
    );
  }
  return Resultado.ok(senha);
}

export async function resumirSenhaNova(
  dependencias: { readonly cofre: CofreDeSenhas; readonly senhasVazadas: ListaDeSenhasVazadas },
  senha: string,
): Promise<Resultado<string, ErroDeNegocio>> {
  const conferida = conferirSenhaNova(dependencias.senhasVazadas, senha);
  return conferida.ok ? Resultado.ok(await dependencias.cofre.resumir(senha)) : conferida;
}
