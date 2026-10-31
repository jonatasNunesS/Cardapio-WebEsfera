import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import { resumirSenhaNova } from '../../identidade/senha-nova.ts';
import type { DependenciasDaPlataforma } from '../dependencias.ts';

export async function aceitarConvite(
  dependencias: DependenciasDaPlataforma,
  entrada: { readonly token: string; readonly senha: string },
): Promise<Resultado<null, ErroDeNegocio>> {
  const hash = await resumirSenhaNova(dependencias, entrada.senha);
  if (!hash.ok) {
    return hash;
  }
  const aceito = await dependencias.plataforma.aceitarConvite(
    dependencias.segredos.resumo(entrada.token),
    hash.valor,
    dependencias.relogio.agora(),
  );
  return aceito
    ? Resultado.ok(null)
    : Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.CONVITE_ACEITAR_INVALIDO,
          'Este convite expirou, já foi usado ou foi trocado por um novo. Peça outro ao suporte.',
        ),
      );
}
