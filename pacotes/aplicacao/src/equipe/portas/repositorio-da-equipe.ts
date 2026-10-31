import type { SituacaoDoChamado, SituacaoDoPedido, TipoDeChamado } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';

export interface ItemNaFila {
  readonly nome: string;
  readonly quantidade: number;
  readonly observacao: string;
}

export interface PedidoNaFila {
  readonly id: string;
  readonly numero: number;
  readonly situacao: SituacaoDoPedido;
  readonly mesaNumero: number;
  readonly sessaoMesaId: string;
  readonly totalCentavos: number;
  readonly criadoEm: Date;
  readonly itens: readonly ItemNaFila[];
}

export interface ChamadoNaFila {
  readonly id: string;
  readonly tipo: TipoDeChamado;
  readonly situacao: SituacaoDoChamado;
  readonly mesaNumero: number;
  readonly sessaoMesaId: string;
  readonly criadoEm: Date;
}

export interface SessaoNaFila {
  readonly id: string;
  readonly mesaNumero: number;
  readonly abertaEm: Date;
}

export interface FilaDaEquipe {
  readonly pedidos: readonly PedidoNaFila[];
  readonly chamados: readonly ChamadoNaFila[];
  readonly sessoes: readonly SessaoNaFila[];
}

export interface MudancaDeSituacao<S> {
  readonly id: string;
  readonly de: S;
  readonly para: S;
}

export type DesfechoDaMudanca<S> =
  | { readonly tipo: 'alterado' }
  | { readonly tipo: 'nao-encontrado' }
  | { readonly tipo: 'desatualizado'; readonly atual: S };

export type DesfechoDoEncerramento =
  | { readonly tipo: 'encerrada' | 'nao-encontrada' | 'ja-fechada' }
  | { readonly tipo: 'pendencias'; readonly pedidos: number; readonly chamados: number };

export interface RepositorioDaEquipe {
  fila(acesso: AcessoAoRestaurante, agora: Date): Promise<FilaDaEquipe>;
  mudarPedido(
    acesso: AcessoAoRestaurante,
    mudanca: MudancaDeSituacao<SituacaoDoPedido> & { readonly motivo: string | null },
    agora: Date,
  ): Promise<DesfechoDaMudanca<SituacaoDoPedido>>;
  mudarChamado(
    acesso: AcessoAoRestaurante,
    mudanca: MudancaDeSituacao<SituacaoDoChamado>,
    agora: Date,
  ): Promise<DesfechoDaMudanca<SituacaoDoChamado>>;
  encerrarSessao(
    acesso: AcessoAoRestaurante,
    sessaoMesaId: string,
    confirmado: boolean,
    agora: Date,
  ): Promise<DesfechoDoEncerramento>;
}
