import {
  CODIGOS,
  criarDinheiro,
  criarErroDeNegocio,
  formatarDinheiro,
  momentoLocal,
  montarCardapio,
  Resultado,
  situacaoDoHorario,
  type ErroDeNegocio,
  type PratoDoCardapio,
  type SituacaoDoHorario,
} from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import { personalizacaoPadrao } from '../../personalizacao/personalizacao-padrao.ts';
import type {
  CacheDoCardapio,
  CardapioPublicado,
  DadosDoCardapioPublico,
  FonteDoCardapioPublico,
} from '../portas/fonte-do-cardapio-publico.ts';
import type { PratoGuardado } from '../portas/repositorio-do-cardapio.ts';

export interface DependenciasDoCardapioPublico {
  readonly fonte: FonteDoCardapioPublico;
  readonly cache: CacheDoCardapio;
  readonly relogio: Relogio;
}

export type CardapioParaOCliente =
  | { readonly tipo: 'redirecionar'; readonly slug: string }
  | ({ readonly tipo: 'cardapio'; readonly cardapio: CardapioPublicado } & SituacaoDoHorario);

export const CARDAPIO_NAO_ENCONTRADO = criarErroDeNegocio(
  CODIGOS.CARDAPIO_CONSULTAR_NAO_ENCONTRADO,
  'Cardápio não encontrado.',
);

function paraDoCardapio(prato: PratoGuardado): PratoDoCardapio | undefined {
  const preco = criarDinheiro(prato.precoCentavos);
  return preco.ok ? { ...prato, preco: preco.valor, removido: false } : undefined;
}

export function montarCardapioPublicado(dados: DadosDoCardapioPublico): CardapioPublicado {
  const pratos = dados.pratos.flatMap((prato) => paraDoCardapio(prato) ?? []);
  const montado = montarCardapio(dados.categorias, pratos);
  return {
    versao: dados.versao,
    restaurante: dados.restaurante,
    personalizacao: dados.personalizacao ?? personalizacaoPadrao(),
    horarios: dados.horarios,
    secoes: montado.secoes.map((secao) => ({
      id: secao.id,
      nome: secao.nome,
      pratos: secao.pratos.map((prato) => ({
        id: prato.id,
        nome: prato.nome,
        descricao: prato.descricao,
        precoCentavos: prato.preco.centavos,
        preco: formatarDinheiro(prato.preco),
        disponivel: prato.disponivel,
        destaque: prato.destaque,
      })),
    })),
    destaques: montado.destaques.map((prato) => prato.id),
  };
}

async function cardapioDaVersao(
  dependencias: DependenciasDoCardapioPublico,
  restauranteId: string,
  versao: number,
): Promise<CardapioPublicado> {
  const guardado = await dependencias.cache.ler(restauranteId, versao);
  if (guardado !== null) {
    return guardado;
  }
  const cardapio = montarCardapioPublicado(await dependencias.fonte.ler(restauranteId));
  await dependencias.cache.gravar(restauranteId, cardapio);
  return cardapio;
}

export async function obterCardapioPublicado(
  dependencias: DependenciasDoCardapioPublico,
  slug: string,
): Promise<Resultado<CardapioParaOCliente, ErroDeNegocio>> {
  const resolucao = await dependencias.fonte.resolver(slug);
  if (resolucao.situacao === 'inexistente') {
    return Resultado.falha(CARDAPIO_NAO_ENCONTRADO);
  }
  if (resolucao.situacao === 'redirecionar') {
    return Resultado.ok({ tipo: 'redirecionar', slug: resolucao.slugAtual });
  }
  const cardapio = await cardapioDaVersao(dependencias, resolucao.restauranteId, resolucao.versao);
  const momento = momentoLocal(dependencias.relogio.agora(), cardapio.restaurante.fusoHorario);
  return Resultado.ok({ tipo: 'cardapio', cardapio, ...situacaoDoHorario(cardapio.horarios, momento) });
}
