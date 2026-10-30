import type { ErroDeNegocio, Resultado } from '@cardapio/dominio';
import type { SessaoDoCliente } from '../../pedidos/portas/repositorio-de-pedidos.ts';
import { abrirChamado, type ChamadoAberto } from '../abrir-chamado.ts';
import type { DependenciasDoAtendimento } from '../dependencias.ts';

export function chamarGarcom(
  dependencias: DependenciasDoAtendimento,
  sessao: SessaoDoCliente,
  chave: string,
): Promise<Resultado<ChamadoAberto, ErroDeNegocio>> {
  return abrirChamado(dependencias, sessao, 'garcom', chave);
}
