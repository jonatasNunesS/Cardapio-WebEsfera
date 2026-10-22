import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { canais, ehHexadecimal, paraHexadecimal, razaoDeContraste } from './contraste.ts';

export const FUNDO_DO_CARDAPIO = '#F7F4F0';
export const TEXTO_PADRAO = '#1F1A17';
export const BRANCO = '#FFFFFF';
export const CONTRASTE_MINIMO_TEXTO = 4.5;
export const CONTRASTE_MINIMO_FUNDO = 3;
const PASSOS_DA_SUGESTAO = 20;

export interface AvaliacaoDaCor {
  readonly cor: string;
  readonly corSobreMarca: string;
  readonly corMarcaTexto: string;
  readonly contrasteTexto: number;
  readonly contrasteFundo: number;
  readonly passa: boolean;
}

export interface CorDaMarca {
  readonly cor: string;
  readonly corSobreMarca: string;
  readonly corMarcaTexto: string;
}

export function avaliarCorDaMarca(hex: string): AvaliacaoDaCor {
  const cor = hex.toUpperCase();
  const corSobreMarca =
    razaoDeContraste(cor, BRANCO) >= razaoDeContraste(cor, TEXTO_PADRAO) ? BRANCO : TEXTO_PADRAO;
  const contrasteTexto = razaoDeContraste(cor, corSobreMarca);
  const contrasteFundo = razaoDeContraste(cor, FUNDO_DO_CARDAPIO);
  return {
    cor,
    corSobreMarca,
    corMarcaTexto: contrasteFundo >= CONTRASTE_MINIMO_TEXTO ? cor : TEXTO_PADRAO,
    contrasteTexto,
    contrasteFundo,
    passa: contrasteTexto >= CONTRASTE_MINIMO_TEXTO && contrasteFundo >= CONTRASTE_MINIMO_FUNDO,
  };
}

export function sugerirCorDaMarca(hex: string): string {
  const [r, g, b] = canais(hex.toUpperCase());
  for (let passo = 1; passo <= PASSOS_DA_SUGESTAO; passo += 1) {
    const fator = 1 - passo / PASSOS_DA_SUGESTAO;
    const candidata = paraHexadecimal([r * fator, g * fator, b * fator]);
    if (avaliarCorDaMarca(candidata).passa) {
      return candidata;
    }
  }
  return TEXTO_PADRAO;
}

function arredondar(valor: number): number {
  return Math.floor(valor * 100) / 100;
}

export function criarCorDaMarca(hex: string): Resultado<CorDaMarca, ErroDeNegocio> {
  if (!ehHexadecimal(hex)) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.PERSONALIZACAO_PUBLICAR_COR_INVALIDA,
        'A cor precisa estar no formato #RRGGBB.',
        { campo: 'corMarca' },
      ),
    );
  }
  const avaliacao = avaliarCorDaMarca(hex);
  if (!avaliacao.passa) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.PERSONALIZACAO_PUBLICAR_COR_SEM_CONTRASTE,
        'Essa cor fica ilegível no cardápio. Use a sugestão ou escolha outra.',
        {
          campo: 'corMarca',
          sugestao: sugerirCorDaMarca(hex),
          contrasteTexto: arredondar(avaliacao.contrasteTexto),
          contrasteFundo: arredondar(avaliacao.contrasteFundo),
        },
      ),
    );
  }
  const { cor, corSobreMarca, corMarcaTexto } = avaliacao;
  return Resultado.ok({ cor, corSobreMarca, corMarcaTexto });
}
