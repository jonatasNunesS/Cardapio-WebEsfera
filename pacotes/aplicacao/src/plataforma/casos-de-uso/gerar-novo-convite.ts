import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import { novoConvite } from '../convite.ts';
import type { DependenciasDaPlataforma } from '../dependencias.ts';
import { RESTAURANTE_NAO_ENCONTRADO } from '../falhas.ts';
import type { AcessoDoAdmin } from '../portas/repositorio-da-plataforma.ts';

export async function gerarNovoConvite(
  dependencias: DependenciasDaPlataforma,
  acesso: AcessoDoAdmin,
  slug: string,
): Promise<Resultado<{ readonly linkDoConvite: string | null }, ErroDeNegocio>> {
  const restauranteId = await dependencias.plataforma.resolver(acesso, slug);
  if (restauranteId === null) {
    return Resultado.falha(RESTAURANTE_NAO_ENCONTRADO);
  }
  const agora = dependencias.relogio.agora();
  const { convite, link } = novoConvite(dependencias, agora);
  const dono = await dependencias.plataforma.gerarConvite(acesso, restauranteId, convite, agora);
  if (dono === null) {
    return Resultado.falha(RESTAURANTE_NAO_ENCONTRADO);
  }
  const entrega = await dependencias.enviador.enviar({ ...dono, link, expiraEm: convite.expiraEm });
  return Resultado.ok({ linkDoConvite: entrega.linkParaOAdmin });
}
