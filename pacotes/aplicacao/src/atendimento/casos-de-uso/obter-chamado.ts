import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import { SESSAO_EXPIRADA } from '../../pedidos/falhas.ts';
import type { SessaoDoCliente } from '../../pedidos/portas/repositorio-de-pedidos.ts';
import type { DependenciasDoAtendimento } from '../dependencias.ts';
import type { ChamadoGuardado } from '../portas/repositorio-de-atendimento.ts';

export const CHAMADO_NAO_ENCONTRADO = criarErroDeNegocio(
  CODIGOS.CHAMADO_CONSULTAR_NAO_ENCONTRADO,
  'Não encontramos este chamado nesta mesa.',
);

export async function obterChamado(
  dependencias: DependenciasDoAtendimento,
  sessao: SessaoDoCliente,
  id: string,
): Promise<Resultado<ChamadoGuardado, ErroDeNegocio>> {
  const chamado = await dependencias.atendimento.obterChamado(sessao, id, dependencias.relogio.agora());
  if (chamado === 'sessao-expirada') {
    return Resultado.falha(SESSAO_EXPIRADA);
  }
  return chamado === null ? Resultado.falha(CHAMADO_NAO_ENCONTRADO) : Resultado.ok(chamado);
}
