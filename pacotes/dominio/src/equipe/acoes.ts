import type { SituacaoDoChamado } from '../atendimento/chamado.ts';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import type { SituacaoDoPedido } from '../pedidos/pedido.ts';

export const MOTIVO_DE_CANCELAMENTO = { minimo: 3, maximo: 200 } as const;

const PROXIMA_DO_PEDIDO: Readonly<Partial<Record<SituacaoDoPedido, SituacaoDoPedido>>> = {
  enviado: 'em_preparo',
  em_preparo: 'pronto',
  pronto: 'entregue',
};

const PROXIMA_DO_CHAMADO: Readonly<Partial<Record<SituacaoDoChamado, SituacaoDoChamado>>> = {
  aguardando: 'em_atendimento',
  em_atendimento: 'concluido',
};

export function proximaSituacaoDoPedido(situacao: SituacaoDoPedido): SituacaoDoPedido | null {
  return PROXIMA_DO_PEDIDO[situacao] ?? null;
}

export function proximaSituacaoDoChamado(situacao: SituacaoDoChamado): SituacaoDoChamado | null {
  return PROXIMA_DO_CHAMADO[situacao] ?? null;
}

export function equipePodeCancelarPedido(situacao: SituacaoDoPedido): boolean {
  return situacao === 'enviado' || situacao === 'em_preparo' || situacao === 'pronto';
}

export function validarMotivoDeCancelamento(texto: string): Resultado<string, ErroDeNegocio> {
  const motivo = texto.trim().replace(/\s+/g, ' ');
  return motivo.length >= MOTIVO_DE_CANCELAMENTO.minimo && motivo.length <= MOTIVO_DE_CANCELAMENTO.maximo
    ? Resultado.ok(motivo)
    : Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.EQUIPE_CANCELAR_MOTIVO_INVALIDO,
          `Explique o cancelamento em ${String(MOTIVO_DE_CANCELAMENTO.minimo)} a ${String(MOTIVO_DE_CANCELAMENTO.maximo)} caracteres.`,
          { campo: 'motivo' },
        ),
      );
}
