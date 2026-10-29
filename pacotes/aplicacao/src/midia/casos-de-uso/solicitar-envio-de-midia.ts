import {
  LIMITES_DA_MIDIA,
  Resultado,
  validarEnvio,
  type ErroDeNegocio,
  type PedidoDeEnvio,
} from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaMidia } from '../dependencias.ts';
import { PRATO_NAO_ENCONTRADO, semPermissaoNaMidia } from '../desfechos.ts';
import type { UrlDeEnvio } from '../portas/armazenamento-de-midia.ts';

export interface EnvioAutorizado extends UrlDeEnvio {
  readonly midiaId: string;
}

export async function solicitarEnvioDeMidia(
  dependencias: DependenciasDaMidia,
  acesso: AcessoAoRestaurante,
  pratoId: string,
  pedido: PedidoDeEnvio,
): Promise<Resultado<EnvioAutorizado, ErroDeNegocio>> {
  const proibido = semPermissaoNaMidia(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const envio = validarEnvio(pedido);
  if (!envio.ok) {
    return envio;
  }
  const criacao = await dependencias.midias.criar(acesso.restauranteId, { pratoId, ...envio.valor });
  if (criacao.tipo === 'prato-inexistente') {
    return Resultado.falha(PRATO_NAO_ENCONTRADO);
  }
  const url = await dependencias.armazenamento.urlDeEnvio({
    caminho: criacao.caminhoOriginal,
    tipoConteudo: envio.valor.tipoConteudo,
    tamanhoBytes: envio.valor.tamanhoBytes,
    validadeS: LIMITES_DA_MIDIA.validadeDaUrlDeEnvioS,
  });
  return Resultado.ok({ midiaId: criacao.midiaId, ...url });
}
