import type { ArquivoGerado } from '@cardapio/aplicacao';
import { nomeDaImagem, type FormatoDeImagem } from '@cardapio/dominio';
import sharp from 'sharp';
import { PIXELS_MAXIMOS_DA_FOTO } from './sonda.ts';

export const QUALIDADE_DAS_IMAGENS = { avif: 50, webp: 72 } as const;

export interface ImagensGeradas {
  readonly largura: number;
  readonly altura: number;
  readonly arquivos: readonly ArquivoGerado[];
}

async function gerarVariante(
  origem: string,
  pasta: string,
  largura: number,
  formato: FormatoDeImagem,
): Promise<ArquivoGerado & { readonly largura: number; readonly altura: number }> {
  const nome = nomeDaImagem(largura, formato);
  const arquivoLocal = `${pasta}/${nome}`;
  const base = sharp(origem, { limitInputPixels: PIXELS_MAXIMOS_DA_FOTO, failOn: 'error' })
    .rotate()
    .resize({ width: largura, withoutEnlargement: true });
  const convertida =
    formato === 'avif'
      ? base.avif({ quality: QUALIDADE_DAS_IMAGENS.avif, effort: 4 })
      : base.webp({ quality: QUALIDADE_DAS_IMAGENS.webp });
  const info = await convertida.toFile(arquivoLocal);
  return {
    nome,
    arquivoLocal,
    tipoConteudo: `image/${formato}`,
    bytes: info.size,
    largura: info.width,
    altura: info.height,
  };
}

export async function gerarImagens(
  origem: string,
  pasta: string,
  larguras: readonly number[],
): Promise<ImagensGeradas> {
  const arquivos = [];
  for (const largura of larguras) {
    for (const formato of ['avif', 'webp'] as const) {
      arquivos.push(await gerarVariante(origem, pasta, largura, formato));
    }
  }
  const maior = arquivos.at(-1);
  return {
    largura: maior?.largura ?? 0,
    altura: maior?.altura ?? 0,
    arquivos: arquivos.map((arquivo) => ({
      nome: arquivo.nome,
      arquivoLocal: arquivo.arquivoLocal,
      tipoConteudo: arquivo.tipoConteudo,
      bytes: arquivo.bytes,
      largura: arquivo.largura,
    })),
  };
}
