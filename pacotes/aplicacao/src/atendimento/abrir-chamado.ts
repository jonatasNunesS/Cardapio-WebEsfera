import { Resultado, type ErroDeNegocio, type TipoDeChamado } from '@cardapio/dominio';
import { SESSAO_EXPIRADA } from '../pedidos/falhas.ts';
import type { SessaoDoCliente } from '../pedidos/portas/repositorio-de-pedidos.ts';
import type { DependenciasDoAtendimento } from './dependencias.ts';
import type { ChamadoGuardado } from './portas/repositorio-de-atendimento.ts';

export interface ChamadoAberto {
  readonly novo: boolean;
  readonly chamado: ChamadoGuardado;
}

export async function abrirChamado(
  dependencias: DependenciasDoAtendimento,
  sessao: SessaoDoCliente,
  tipo: TipoDeChamado,
  chave: string,
): Promise<Resultado<ChamadoAberto, ErroDeNegocio>> {
  const desfecho = await dependencias.atendimento.abrirChamado(
    sessao,
    tipo,
    chave,
    dependencias.relogio.agora(),
  );
  if (desfecho.tipo === 'sessao-expirada') {
    return Resultado.falha(SESSAO_EXPIRADA);
  }
  return Resultado.ok({ novo: desfecho.tipo === 'criado', chamado: desfecho.chamado });
}
