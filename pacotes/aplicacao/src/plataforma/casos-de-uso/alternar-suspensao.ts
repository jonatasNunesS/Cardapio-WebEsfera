import {
  CODIGOS,
  criarErroDeNegocio,
  Resultado,
  validarMotivoDoAdmin,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { DependenciasDaPlataforma } from '../dependencias.ts';
import { RESTAURANTE_NAO_ENCONTRADO } from '../falhas.ts';
import type { AcessoDoAdmin } from '../portas/repositorio-da-plataforma.ts';

const JA_SUSPENSO = criarErroDeNegocio(
  CODIGOS.PLATAFORMA_SUSPENDER_JA_SUSPENSO,
  'Este restaurante já está suspenso.',
);
const NAO_SUSPENSO = criarErroDeNegocio(
  CODIGOS.PLATAFORMA_REATIVAR_NAO_SUSPENSO,
  'Este restaurante não está suspenso.',
);

export async function alternarSuspensao(
  dependencias: DependenciasDaPlataforma,
  acesso: AcessoDoAdmin,
  pedido: { readonly slug: string; readonly suspender: boolean; readonly motivo: string },
): Promise<Resultado<null, ErroDeNegocio>> {
  const motivo = validarMotivoDoAdmin(pedido.motivo);
  if (!motivo.ok) {
    return motivo;
  }
  const restauranteId = await dependencias.plataforma.resolver(acesso, pedido.slug);
  if (restauranteId === null) {
    return Resultado.falha(RESTAURANTE_NAO_ENCONTRADO);
  }
  const agora = dependencias.relogio.agora();
  const feito = pedido.suspender
    ? await dependencias.plataforma.suspender(acesso, restauranteId, motivo.valor, agora)
    : await dependencias.plataforma.reativar(acesso, restauranteId, motivo.valor, agora);
  if (!feito) {
    return Resultado.falha(pedido.suspender ? JA_SUSPENSO : NAO_SUSPENSO);
  }
  return Resultado.ok(null);
}
