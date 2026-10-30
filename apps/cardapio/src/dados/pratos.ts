import type { MidiaPublica, PratoPublico } from '@cardapio/contratos';
import type { ImagemPrato, PropriedadesVideoPrato } from '@cardapio/ui';

export function imagemDo(nome: string, midia: MidiaPublica | null): ImagemPrato | undefined {
  if (midia === null) {
    return undefined;
  }
  const { imagem } = midia;
  return {
    src: imagem.src,
    alt: nome,
    avif: imagem.avif,
    webp: imagem.webp,
    largura: imagem.largura,
    altura: imagem.altura,
  };
}

export function videoDo(nome: string, midia: MidiaPublica | null): PropriedadesVideoPrato | undefined {
  if (midia?.video == null) {
    return undefined;
  }
  return {
    fonteMp4: midia.video.mp4,
    fonteWebm: midia.video.webm,
    capa: midia.video.capa,
    descricao: `${nome} em vídeo`,
  };
}

export function propriedadesDoCartao(prato: PratoPublico, href: string) {
  return {
    nome: prato.nome,
    precoEmCentavos: prato.precoCentavos,
    href,
    descricao: prato.descricao === '' ? undefined : prato.descricao,
    imagem: imagemDo(prato.nome, prato.midia),
    video: videoDo(prato.nome, prato.midia),
    esgotado: !prato.disponivel,
  };
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function textoDaAbertura(
  proxima: { readonly diaSemana: number; readonly abre: string; readonly hoje: boolean } | null,
): string | undefined {
  if (proxima === null) {
    return undefined;
  }
  const hora = proxima.abre.slice(0, 5);
  return proxima.hoje ? `Abre hoje às ${hora}.` : `Abre ${DIAS[proxima.diaSemana] ?? ''} às ${hora}.`;
}
