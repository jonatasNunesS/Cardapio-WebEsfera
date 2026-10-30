import type { SituacaoDoChamado, SituacaoDoPedido, TipoDeChamado } from '@cardapio/dominio';
import type { SessaoDoCliente } from '../../pedidos/portas/repositorio-de-pedidos.ts';

export interface ChamadoGuardado {
  readonly id: string;
  readonly tipo: TipoDeChamado;
  readonly situacao: SituacaoDoChamado;
  readonly criadoEm: Date;
}

export interface ItemDaConta {
  readonly nome: string;
  readonly quantidade: number;
  readonly precoCentavos: number;
}

export interface PedidoDaSessao {
  readonly situacao: SituacaoDoPedido;
  readonly totalCentavos: number;
  readonly itens: readonly ItemDaConta[];
}

export type SituacaoDaSessao = 'aberta' | 'encerrada' | 'expirada';

export type DesfechoDoChamado =
  | { readonly tipo: 'criado' | 'existente'; readonly chamado: ChamadoGuardado }
  | { readonly tipo: 'sessao-expirada' };

export type DesfechoDoCancelamentoDoChamado =
  'cancelado' | 'nao-encontrado' | 'fora-de-hora' | 'sessao-expirada';

export interface RepositorioDeAtendimento {
  abrirChamado(
    sessao: SessaoDoCliente,
    tipo: TipoDeChamado,
    chave: string,
    agora: Date,
  ): Promise<DesfechoDoChamado>;
  obterChamado(
    sessao: SessaoDoCliente,
    id: string,
    agora: Date,
  ): Promise<ChamadoGuardado | 'sessao-expirada' | null>;
  cancelarChamado(
    sessao: SessaoDoCliente,
    id: string,
    agora: Date,
    podeCancelar: (situacao: SituacaoDoChamado) => boolean,
  ): Promise<DesfechoDoCancelamentoDoChamado>;
  pedidosDaSessao(
    sessao: SessaoDoCliente,
    agora: Date,
  ): Promise<readonly PedidoDaSessao[] | 'sessao-expirada'>;
  situacaoDaSessao(sessao: SessaoDoCliente, agora: Date): Promise<SituacaoDaSessao>;
}
