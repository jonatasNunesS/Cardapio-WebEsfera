import { z } from 'zod';
export { rotaCom, ROTAS_DO_CARDAPIO_PUBLICO } from '../publico.ts';
import type { MidiaPublica } from '../midia/esquemas.ts';

export const LIMITES_DO_CARDAPIO_NA_API = {
  nomeDaCategoria: 40,
  nomeDoPrato: 80,
  descricaoDoPrato: 400,
  termoDeBusca: 60,
  precoMaximoEmCentavos: 1_000_000_00,
} as const;

export const ROTAS_DO_CARDAPIO_NO_PAINEL = {
  cardapio: '/api/v1/cardapio',
  categorias: '/api/v1/cardapio/categorias',
  categoria: '/api/v1/cardapio/categorias/:id',
  posicaoDaCategoria: '/api/v1/cardapio/categorias/:id/posicao',
  pratos: '/api/v1/cardapio/pratos',
  prato: '/api/v1/cardapio/pratos/:id',
  situacaoDoPrato: '/api/v1/cardapio/pratos/:id/situacao',
  posicaoDoPrato: '/api/v1/cardapio/pratos/:id/posicao',
} as const;

const SEGMENTADOR = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });

const textoAte = (limite: number, minimo: number) =>
  z
    .string()
    .max(limite * 4)
    .refine(
      (valor) => {
        const tamanho = Array.from(SEGMENTADOR.segment(valor.trim())).length;
        return tamanho >= minimo && tamanho <= limite;
      },
      `Use de ${String(minimo)} a ${String(limite)} caracteres.`,
    );

const versao = z.number().int().positive();
const nomeDaCategoria = textoAte(LIMITES_DO_CARDAPIO_NA_API.nomeDaCategoria, 1);
const nomeDoPrato = textoAte(LIMITES_DO_CARDAPIO_NA_API.nomeDoPrato, 1);
const descricaoDoPrato = textoAte(LIMITES_DO_CARDAPIO_NA_API.descricaoDoPrato, 0);
const precoCentavos = z.number().int().min(0).max(LIMITES_DO_CARDAPIO_NA_API.precoMaximoEmCentavos);

export const esquemaIdDoItem = z.strictObject({ id: z.uuid() });
export const esquemaCriarCategoria = z.strictObject({ nome: nomeDaCategoria });
export const esquemaEditarCategoria = z.strictObject({ nome: nomeDaCategoria, versao });
export const esquemaVersaoDoItem = z.strictObject({ versao });
export const esquemaMoverItem = z.strictObject({ versao, posicao: z.number().int().min(0).max(10_000) });

const camposDoPrato = {
  categoriaId: z.uuid(),
  nome: nomeDoPrato,
  descricao: descricaoDoPrato,
  precoCentavos,
  disponivel: z.boolean(),
  destaque: z.boolean(),
};

export const esquemaCriarPrato = z.strictObject(camposDoPrato);
export const esquemaEditarPrato = z.strictObject({ ...camposDoPrato, versao });
export const esquemaAlterarSituacaoDoPrato = z
  .strictObject({ versao, disponivel: z.boolean().optional(), destaque: z.boolean().optional() })
  .refine((corpo) => corpo.disponivel !== undefined || corpo.destaque !== undefined);

export const esquemaSlugPublico = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(60),
});
export const esquemaTermoDeBusca = z.strictObject({
  termo: z.string().max(LIMITES_DO_CARDAPIO_NA_API.termoDeBusca),
});

export type CorpoCriarCategoria = z.infer<typeof esquemaCriarCategoria>;
export type CorpoEditarCategoria = z.infer<typeof esquemaEditarCategoria>;
export type CorpoVersaoDoItem = z.infer<typeof esquemaVersaoDoItem>;
export type CorpoMoverItem = z.infer<typeof esquemaMoverItem>;
export type CorpoCriarPrato = z.infer<typeof esquemaCriarPrato>;
export type CorpoEditarPrato = z.infer<typeof esquemaEditarPrato>;
export type CorpoAlterarSituacaoDoPrato = z.infer<typeof esquemaAlterarSituacaoDoPrato>;

export interface PratoNoPainel {
  readonly id: string;
  readonly categoriaId: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly disponivel: boolean;
  readonly destaque: boolean;
  readonly ordem: number;
  readonly versao: number;
}

export interface CategoriaNoPainel {
  readonly id: string;
  readonly nome: string;
  readonly ordem: number;
  readonly versao: number;
  readonly pratos: readonly PratoNoPainel[];
}

export interface RespostaCardapioDoPainel {
  readonly categorias: readonly CategoriaNoPainel[];
}

export interface PratoPublico {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly preco: string;
  readonly disponivel: boolean;
  readonly destaque: boolean;
  readonly midia: MidiaPublica | null;
}

export interface SecaoPublica {
  readonly id: string;
  readonly nome: string;
  readonly pratos: readonly PratoPublico[];
}

export interface PersonalizacaoPublica {
  readonly corMarca: string;
  readonly corSobreMarca: string;
  readonly corMarcaTexto: string;
  readonly logoUrl: string | null;
  readonly capaUrl: string | null;
  readonly frase: string;
  readonly linkAvaliacaoGoogle: string | null;
  readonly textos: {
    readonly boasVindas: string;
    readonly aoChamarGarcom: string;
    readonly restauranteFechado: string;
  };
}

export interface RespostaCardapioPublico {
  readonly restaurante: { readonly nome: string; readonly slug: string };
  readonly personalizacao: PersonalizacaoPublica | null;
  readonly aberto: boolean;
  readonly proximaAbertura: {
    readonly diaSemana: number;
    readonly abre: string;
    readonly hoje: boolean;
  } | null;
  readonly secoes: readonly SecaoPublica[];
  readonly destaques: readonly string[];
  readonly versao: number;
}

export interface ResultadoDaBusca extends PratoPublico {
  readonly categoria: string;
}

export interface RespostaBuscaPublica {
  readonly termo: string;
  readonly resultados: readonly ResultadoDaBusca[];
}

const PRECO_EM_TEXTO = /^(\d{1,3}(?:\.\d{3})+|\d{1,7})(?:,(\d{1,2}))?$/;

export function centavosDoTexto(texto: string): number | null {
  const partes = PRECO_EM_TEXTO.exec(texto.trim().replace(/^R\$\s*/i, ''));
  if (partes === null) {
    return null;
  }
  const reais = Number((partes[1] ?? '').replace(/\./g, ''));
  const centavos = Number((partes[2] ?? '').padEnd(2, '0'));
  return reais * 100 + centavos;
}

function separarMilhares(reais: number): string {
  return String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function textoDoPreco(centavos: number): string {
  return `${separarMilhares(Math.trunc(centavos / 100))},${String(centavos % 100).padStart(2, '0')}`;
}

export function formatarPreco(centavos: number): string {
  return `R$ ${textoDoPreco(centavos)}`;
}
