import { CODIGOS } from '../compartilhado/codigos.ts';
import { ErroInvarianteDominio } from '../compartilhado/erro-invariante-dominio.ts';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type FormatoDeImagem = 'avif' | 'webp';

export type NomeDoDerivado = 'video.mp4' | 'video.webm' | 'capa.jpg' | `imagem-${string}.${FormatoDeImagem}`;

export function nomeDaImagem(largura: number, formato: FormatoDeImagem): NomeDoDerivado {
  return `imagem-${String(largura)}.${formato}`;
}

function exigirUuid(valor: string, campo: string): string {
  if (!PADRAO_UUID.test(valor)) {
    throw new ErroInvarianteDominio(
      CODIGOS.MIDIA_CAMINHO_ID_INVALIDO,
      'Identificador inválido no caminho da mídia',
      {
        modulo: 'midia',
        casoDeUso: 'montarCaminho',
        dados: { campo },
      },
    );
  }
  return valor;
}

export function prefixoDaMidia(restauranteId: string, midiaId: string): string {
  return `r/${exigirUuid(restauranteId, 'restauranteId')}/midias/${exigirUuid(midiaId, 'midiaId')}/`;
}

export function caminhoDoOriginal(restauranteId: string, midiaId: string): string {
  return `${prefixoDaMidia(restauranteId, midiaId)}original`;
}

export function caminhoDoDerivado(restauranteId: string, midiaId: string, nome: NomeDoDerivado): string {
  return `${prefixoDaMidia(restauranteId, midiaId)}${nome}`;
}

export function pertenceAoRestaurante(caminho: string, restauranteId: string): boolean {
  return caminho.startsWith(`r/${exigirUuid(restauranteId, 'restauranteId')}/midias/`);
}
