import {
  clientePodeCancelarChamado,
  CODIGOS,
  criarErroDeNegocio,
  Resultado,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import { SESSAO_EXPIRADA } from '../../pedidos/falhas.ts';
import type { SessaoDoCliente } from '../../pedidos/portas/repositorio-de-pedidos.ts';
import type { DependenciasDoAtendimento } from '../dependencias.ts';
import { CHAMADO_NAO_ENCONTRADO } from './obter-chamado.ts';

export async function cancelarChamado(
  dependencias: DependenciasDoAtendimento,
  sessao: SessaoDoCliente,
  id: string,
): Promise<Resultado<null, ErroDeNegocio>> {
  const desfecho = await dependencias.atendimento.cancelarChamado(
    sessao,
    id,
    dependencias.relogio.agora(),
    clientePodeCancelarChamado,
  );
  switch (desfecho) {
    case 'cancelado':
      return Resultado.ok(null);
    case 'nao-encontrado':
      return Resultado.falha(CHAMADO_NAO_ENCONTRADO);
    case 'sessao-expirada':
      return Resultado.falha(SESSAO_EXPIRADA);
    case 'fora-de-hora':
      return Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.CHAMADO_CANCELAR_FORA_DE_HORA,
          'A equipe já está atendendo este chamado. Se não precisar mais, avise quem vier à mesa.',
        ),
      );
  }
}
