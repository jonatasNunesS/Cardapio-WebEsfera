import { avaliarCorDaMarca } from '@cardapio/dominio';
import type { PersonalizacaoPublicada } from './portas/repositorio-de-personalizacao.ts';

export const COR_PADRAO_DA_MARCA = '#B4441F';

export function personalizacaoPadrao(): PersonalizacaoPublicada {
  const cor = avaliarCorDaMarca(COR_PADRAO_DA_MARCA);
  return {
    corMarca: COR_PADRAO_DA_MARCA,
    corSobreMarca: cor.corSobreMarca,
    corMarcaTexto: cor.corMarcaTexto,
    logoUrl: null,
    capaUrl: null,
    frase: '',
    linkAvaliacaoGoogle: null,
    linkInstagram: null,
    textos: {
      boasVindas: 'Peça pelo celular quando quiser. Se preferir, chamamos alguém da equipe.',
      aoChamarGarcom: 'Já avisamos a equipe. Alguém vem até a sua mesa.',
      restauranteFechado: 'Estamos fechados agora.',
    },
  };
}
