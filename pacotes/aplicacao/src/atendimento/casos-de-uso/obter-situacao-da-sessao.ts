import type { SessaoDoCliente } from '../../pedidos/portas/repositorio-de-pedidos.ts';
import type { DependenciasDoAtendimento } from '../dependencias.ts';
import type { SituacaoDaSessao } from '../portas/repositorio-de-atendimento.ts';

export function obterSituacaoDaSessao(
  dependencias: DependenciasDoAtendimento,
  sessao: SessaoDoCliente | null,
): Promise<SituacaoDaSessao> {
  return sessao === null
    ? Promise.resolve('expirada')
    : dependencias.atendimento.situacaoDaSessao(sessao, dependencias.relogio.agora());
}
