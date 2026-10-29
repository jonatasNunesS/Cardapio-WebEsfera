import type { Derivados, FormatoDeImagem, ImagemResponsiva } from '@cardapio/dominio';

export interface EnderecosDeMidia {
  urlPublica(caminho: string): string;
}

export interface ImagemPublicada {
  readonly largura: number;
  readonly altura: number;
  readonly src: string;
  readonly avif: string;
  readonly webp: string;
}

export interface VideoPublicado {
  readonly capa: string;
  readonly mp4: string;
  readonly webm: string;
  readonly duracaoMs: number;
}

export interface MidiaPublicada {
  readonly tipo: 'foto' | 'video';
  readonly imagem: ImagemPublicada;
  readonly video: VideoPublicado | null;
}

function variantesDe(imagem: ImagemResponsiva, formato: FormatoDeImagem) {
  return imagem.variantes
    .filter((variante) => variante.formato === formato)
    .sort((a, b) => a.largura - b.largura);
}

function srcset(imagem: ImagemResponsiva, formato: FormatoDeImagem, enderecos: EnderecosDeMidia): string {
  return variantesDe(imagem, formato)
    .map((variante) => `${enderecos.urlPublica(variante.caminho)} ${String(variante.largura)}w`)
    .join(', ');
}

function imagemPublicada(imagem: ImagemResponsiva, enderecos: EnderecosDeMidia): ImagemPublicada {
  const maior = variantesDe(imagem, 'webp').at(-1);
  return {
    largura: imagem.largura,
    altura: imagem.altura,
    src: maior === undefined ? '' : enderecos.urlPublica(maior.caminho),
    avif: srcset(imagem, 'avif', enderecos),
    webp: srcset(imagem, 'webp', enderecos),
  };
}

export function midiaPublicada(derivados: Derivados, enderecos: EnderecosDeMidia): MidiaPublicada {
  const imagem = imagemPublicada(derivados.imagem, enderecos);
  if (derivados.tipo === 'foto') {
    return { tipo: 'foto', imagem, video: null };
  }
  return {
    tipo: 'video',
    imagem,
    video: {
      capa: enderecos.urlPublica(derivados.capa.caminho),
      mp4: enderecos.urlPublica(derivados.mp4.caminho),
      webm: enderecos.urlPublica(derivados.webm.caminho),
      duracaoMs: derivados.duracaoMs,
    },
  };
}
