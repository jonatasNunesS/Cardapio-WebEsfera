import {
  criarDinheiro,
  formatarDinheiro,
  Resultado,
  termosDeBusca,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type {
  FonteDoCardapioPublico,
  PratoEncontrado,
  PratoEncontradoNoBanco,
} from '../portas/fonte-do-cardapio-publico.ts';
import { midiaPublicada, type EnderecosDeMidia } from '../../midia/publicacao.ts';
import { CARDAPIO_NAO_ENCONTRADO } from './obter-cardapio-publicado.ts';

export type BuscaParaOCliente =
  | { readonly tipo: 'redirecionar'; readonly slug: string }
  | { readonly tipo: 'resultados'; readonly pratos: readonly PratoEncontrado[] };

function comPreco(prato: PratoEncontradoNoBanco, enderecos: EnderecosDeMidia): PratoEncontrado[] {
  const preco = criarDinheiro(prato.precoCentavos);
  if (!preco.ok) {
    return [];
  }
  const { derivados, ...dados } = prato;
  const midia = derivados === null ? null : midiaPublicada(derivados, enderecos);
  return [{ ...dados, preco: formatarDinheiro(preco.valor), midia }];
}

export async function buscarPratos(
  dependencias: { readonly fonte: FonteDoCardapioPublico; readonly enderecos: EnderecosDeMidia },
  slug: string,
  termo: string,
): Promise<Resultado<BuscaParaOCliente, ErroDeNegocio>> {
  const resolucao = await dependencias.fonte.resolver(slug);
  if (resolucao.situacao === 'inexistente') {
    return Resultado.falha(CARDAPIO_NAO_ENCONTRADO);
  }
  if (resolucao.situacao === 'redirecionar') {
    return Resultado.ok({ tipo: 'redirecionar', slug: resolucao.slugAtual });
  }
  const termos = termosDeBusca(termo);
  const encontrados =
    termos.length === 0 ? [] : await dependencias.fonte.buscar(resolucao.restauranteId, termos);
  return Resultado.ok({
    tipo: 'resultados',
    pratos: encontrados.flatMap((prato) => comPreco(prato, dependencias.enderecos)),
  });
}
