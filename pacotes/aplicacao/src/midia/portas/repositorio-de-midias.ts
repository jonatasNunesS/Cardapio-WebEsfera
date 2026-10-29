import type { Derivados, MotivoDaRecusa, SituacaoDaMidia, TipoDeMidia } from '@cardapio/dominio';

export interface MidiaRegistrada {
  readonly id: string;
  readonly pratoId: string;
  readonly tipo: TipoDeMidia;
  readonly situacao: SituacaoDaMidia;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
  readonly caminhoOriginal: string;
  readonly tentativa: number;
  readonly motivoFalha: MotivoDaRecusa | null;
  readonly derivados: Derivados | null;
  readonly originalApagado: boolean;
  readonly descartada: boolean;
}

export interface NovaMidia {
  readonly pratoId: string;
  readonly tipo: TipoDeMidia;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
}

export type DesfechoDaCriacao =
  | { readonly tipo: 'criada'; readonly midiaId: string; readonly caminhoOriginal: string }
  | { readonly tipo: 'prato-inexistente' };

export type DesfechoDaConclusao = 'publicada' | 'descartada' | 'obsoleta';

export interface MidiasDoPrato {
  readonly atual: MidiaRegistrada | null;
  readonly pendente: MidiaRegistrada | null;
}

export interface RepositorioDeMidias {
  criar(restauranteId: string, nova: NovaMidia): Promise<DesfechoDaCriacao>;
  obter(restauranteId: string, midiaId: string): Promise<MidiaRegistrada | null>;
  solicitarProcessamento(
    restauranteId: string,
    midiaId: string,
    situacaoEsperada: 'enviando' | 'falhou',
  ): Promise<number | null>;
  iniciarProcessamento(
    restauranteId: string,
    midiaId: string,
    tentativa: number,
  ): Promise<MidiaRegistrada | null>;
  concluir(
    restauranteId: string,
    midiaId: string,
    tentativa: number,
    derivados: Derivados,
  ): Promise<DesfechoDaConclusao>;
  falhar(restauranteId: string, midiaId: string, tentativa: number, motivo: MotivoDaRecusa): Promise<boolean>;
  listarDoPrato(restauranteId: string, pratoId: string): Promise<MidiasDoPrato | null>;
  removerDoPrato(restauranteId: string, pratoId: string): Promise<boolean>;
  marcarOriginalApagado(restauranteId: string, midiaId: string): Promise<void>;
}
