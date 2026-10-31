import type { SituacaoDoRestaurante } from '@cardapio/dominio';
import type { PersonalizacaoPublicada } from '../../personalizacao/portas/repositorio-de-personalizacao.ts';

export interface AcessoDoAdmin {
  readonly administradorId: string;
}

export interface RestauranteNaPlataforma {
  readonly nome: string;
  readonly slug: string;
  readonly situacao: SituacaoDoRestaurante;
  readonly suspenso: boolean;
  readonly testeTerminaEm: Date;
  readonly criadoEm: Date;
}

export interface ConviteNovo {
  readonly hashToken: string;
  readonly expiraEm: Date;
}

export interface RestauranteDoAdmin {
  readonly nome: string;
  readonly slug: string;
  readonly testeTerminaEm: Date;
  readonly dono: { readonly nome: string; readonly email: string; readonly hashSenhaInutil: string };
  readonly personalizacao: PersonalizacaoPublicada;
  readonly convite: ConviteNovo;
}

export type DesfechoDaCriacaoPeloAdmin = 'criado' | 'slug-ocupado' | 'email-ocupado' | 'proibido';

export interface CobrancaNaPlataforma {
  readonly situacao: string;
  readonly valorCentavos: number;
  readonly venceEm: Date;
  readonly pagaEm: Date | null;
}

export interface FinanceiroDoRestaurante {
  readonly situacaoDoRestaurante: SituacaoDoRestaurante;
  readonly assinatura: {
    readonly situacao: string;
    readonly plano: string;
    readonly pagoAte: Date | null;
    readonly proximaCobrancaEm: Date | null;
  } | null;
  readonly cobrancas: readonly CobrancaNaPlataforma[];
}

export interface Indicadores {
  readonly porSituacao: Readonly<Record<string, number>>;
  readonly pedidosUltimas24h: number;
}

export interface RepositorioDaPlataforma {
  listar(acesso: AcessoDoAdmin): Promise<readonly RestauranteNaPlataforma[]>;
  resolver(acesso: AcessoDoAdmin, slug: string): Promise<string | null>;
  criar(acesso: AcessoDoAdmin, novo: RestauranteDoAdmin, agora: Date): Promise<DesfechoDaCriacaoPeloAdmin>;
  gerarConvite(
    acesso: AcessoDoAdmin,
    restauranteId: string,
    convite: ConviteNovo,
    agora: Date,
  ): Promise<{ readonly nome: string; readonly email: string } | null>;
  suspender(acesso: AcessoDoAdmin, restauranteId: string, motivo: string, agora: Date): Promise<boolean>;
  reativar(acesso: AcessoDoAdmin, restauranteId: string, motivo: string, agora: Date): Promise<boolean>;
  financeiro(restauranteId: string): Promise<FinanceiroDoRestaurante | null>;
  indicadores(acesso: AcessoDoAdmin, agora: Date): Promise<Indicadores>;
  aceitarConvite(hashToken: string, hashSenha: string, agora: Date): Promise<boolean>;
}
