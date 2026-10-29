import {
  caminhoDoDerivado,
  type ArquivoDerivado,
  type Derivados,
  type FormatoDeImagem,
  type VarianteDaImagem,
} from '@cardapio/dominio';
import type { ArquivoGerado, ArquivosGerados } from './portas/processador-de-midia.ts';

const PADRAO_DA_IMAGEM = /^imagem-(\d+)\.(avif|webp)$/;

export interface Destino {
  readonly restauranteId: string;
  readonly midiaId: string;
}

function variante(destino: Destino, arquivo: ArquivoGerado): VarianteDaImagem | undefined {
  const partes = PADRAO_DA_IMAGEM.exec(arquivo.nome);
  if (partes === null) {
    return undefined;
  }
  return {
    caminho: caminhoDoDerivado(destino.restauranteId, destino.midiaId, arquivo.nome),
    bytes: arquivo.bytes,
    largura: Number(partes[1]),
    formato: partes[2] as FormatoDeImagem,
  };
}

function arquivoChamado(
  destino: Destino,
  gerados: ArquivosGerados,
  nome: ArquivoGerado['nome'],
): ArquivoDerivado {
  const arquivo = gerados.arquivos.find((item) => item.nome === nome);
  return {
    caminho: caminhoDoDerivado(destino.restauranteId, destino.midiaId, nome),
    bytes: arquivo?.bytes ?? 0,
  };
}

export function montarDerivados(destino: Destino, gerados: ArquivosGerados): Derivados {
  const imagem = {
    largura: gerados.largura,
    altura: gerados.altura,
    variantes: gerados.arquivos.flatMap((arquivo) => variante(destino, arquivo) ?? []),
  };
  if (gerados.duracaoMs === null) {
    return { tipo: 'foto', imagem };
  }
  return {
    tipo: 'video',
    imagem,
    capa: arquivoChamado(destino, gerados, 'capa.jpg'),
    mp4: arquivoChamado(destino, gerados, 'video.mp4'),
    webm: arquivoChamado(destino, gerados, 'video.webm'),
    duracaoMs: gerados.duracaoMs,
  };
}
