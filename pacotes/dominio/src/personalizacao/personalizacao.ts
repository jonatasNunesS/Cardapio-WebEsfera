import { CODIGOS } from '../compartilhado/codigos.ts';
import { contarCaracteres } from '../compartilhado/texto.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import { criarCorDaMarca, type CorDaMarca } from './cor-da-marca.ts';
import { ehLinkDoGoogle } from './link-google.ts';

export const LIMITES_DE_TEXTO = {
  frase: 80,
  boasVindas: 140,
  aoChamarGarcom: 140,
  restauranteFechado: 140,
} as const;

export type CampoDeTexto = keyof typeof LIMITES_DE_TEXTO;

export interface TextosDoCardapio {
  readonly boasVindas: string;
  readonly aoChamarGarcom: string;
  readonly restauranteFechado: string;
}

export interface DadosDaPersonalizacao {
  readonly corMarca: string;
  readonly logoUrl: string | null;
  readonly capaUrl: string | null;
  readonly frase: string;
  readonly linkAvaliacaoGoogle: string | null;
  readonly textos: TextosDoCardapio;
}

export interface Personalizacao {
  readonly cor: CorDaMarca;
  readonly logoUrl: string | null;
  readonly capaUrl: string | null;
  readonly frase: string;
  readonly linkAvaliacaoGoogle: string | null;
  readonly textos: TextosDoCardapio;
}

const IMAGEM_INTERNA = /^\/midias\/[a-z0-9][a-z0-9/_-]{0,200}\.(?:avif|webp|png|jpe?g)$/;

function imagemInvalida(dados: DadosDaPersonalizacao): 'logoUrl' | 'capaUrl' | undefined {
  return (['logoUrl', 'capaUrl'] as const).find((campo) => {
    const valor = dados[campo]?.trim() ?? '';
    return valor !== '' && (!IMAGEM_INTERNA.test(valor) || valor.includes('//') || valor.includes('..'));
  });
}

function vazioParaNulo(valor: string | null): string | null {
  const limpo = valor?.trim() ?? '';
  return limpo === '' ? null : limpo;
}

function textoLongo(campo: CampoDeTexto): ErroDeNegocio {
  return criarErroDeNegocio(
    CODIGOS.PERSONALIZACAO_PUBLICAR_TEXTO_LONGO,
    `O texto passou de ${String(LIMITES_DE_TEXTO[campo])} caracteres.`,
    { campo, limite: LIMITES_DE_TEXTO[campo] },
  );
}

function primeiroTextoLongo(dados: DadosDaPersonalizacao): CampoDeTexto | undefined {
  const valores: Record<CampoDeTexto, string> = { frase: dados.frase, ...dados.textos };
  return (Object.keys(LIMITES_DE_TEXTO) as CampoDeTexto[]).find(
    (campo) => contarCaracteres(valores[campo].trim()) > LIMITES_DE_TEXTO[campo],
  );
}

export function criarPersonalizacao(dados: DadosDaPersonalizacao): Resultado<Personalizacao, ErroDeNegocio> {
  const cor = criarCorDaMarca(dados.corMarca);
  if (!cor.ok) {
    return cor;
  }
  const longo = primeiroTextoLongo(dados);
  if (longo !== undefined) {
    return Resultado.falha(textoLongo(longo));
  }
  const imagem = imagemInvalida(dados);
  if (imagem !== undefined) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.PERSONALIZACAO_PUBLICAR_IMAGEM_INVALIDA,
        'Use uma imagem enviada pelo painel.',
        { campo: imagem },
      ),
    );
  }
  const link = dados.linkAvaliacaoGoogle?.trim() ?? '';
  if (link !== '' && !ehLinkDoGoogle(link)) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.PERSONALIZACAO_PUBLICAR_LINK_INVALIDO,
        'Esse link não é do Google. Copie o link em "Pedir avaliações" no seu perfil.',
        { campo: 'linkAvaliacaoGoogle' },
      ),
    );
  }
  return Resultado.ok({
    cor: cor.valor,
    logoUrl: vazioParaNulo(dados.logoUrl),
    capaUrl: vazioParaNulo(dados.capaUrl),
    frase: dados.frase.trim(),
    linkAvaliacaoGoogle: link === '' ? null : link,
    textos: {
      boasVindas: dados.textos.boasVindas.trim(),
      aoChamarGarcom: dados.textos.aoChamarGarcom.trim(),
      restauranteFechado: dados.textos.restauranteFechado.trim(),
    },
  });
}
