import type { ArquivoGerado } from '@cardapio/aplicacao';
import { LIMITES_DA_MIDIA, type PlanoDeVideo } from '@cardapio/dominio';
import { stat } from 'node:fs/promises';
import { executarFerramenta, falhaDaFerramenta, type LimitesDaFerramenta } from './ferramenta.ts';

export const PARAMETROS_DO_VIDEO = {
  quadrosPorSegundo: 30,
  taxaMaximaKbps: 400,
  folgaDoConteiner: 0.85,
  reducaoNaSegundaTentativa: 0.6,
  threads: 2,
} as const;

const FILTRO = `fps=${String(PARAMETROS_DO_VIDEO.quadrosPorSegundo)},scale=-2:'min(${String(LIMITES_DA_MIDIA.alturaMaximaDoVideo)},ih)':flags=lanczos`;

type Codificador = 'mp4' | 'webm';

export interface FerramentasDeVideo {
  readonly ffmpeg: string;
  readonly limites: LimitesDaFerramenta;
}

export function taxaDoVideoKbps(duracaoMs: number): number {
  const orcamentoKbit = (LIMITES_DA_MIDIA.tamanhoMaximoDoDerivadoBytes * 8) / 1000;
  const porSegundo = (orcamentoKbit * PARAMETROS_DO_VIDEO.folgaDoConteiner) / (duracaoMs / 1000);
  return Math.floor(Math.min(PARAMETROS_DO_VIDEO.taxaMaximaKbps, porSegundo));
}

function argumentosDoCodificador(codificador: Codificador, kbps: number): string[] {
  const taxa = [
    '-b:v',
    `${String(kbps)}k`,
    '-maxrate',
    `${String(Math.floor(kbps * 1.1))}k`,
    '-bufsize',
    `${String(kbps * 2)}k`,
  ];
  if (codificador === 'mp4') {
    return [
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      ...taxa,
      '-movflags',
      '+faststart',
    ];
  }
  return [
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    ...taxa,
    '-deadline',
    'good',
    '-cpu-used',
    '4',
    '-row-mt',
    '1',
  ];
}

function argumentosDeEntrada(origem: string, duracaoMs: number): string[] {
  return [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-protocol_whitelist',
    'file',
    '-t',
    (duracaoMs / 1000).toFixed(3),
    '-i',
    origem,
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-dn',
    '-map_metadata',
    '-1',
    '-threads',
    String(PARAMETROS_DO_VIDEO.threads),
  ];
}

async function rodarFfmpeg(ferramentas: FerramentasDeVideo, argumentos: readonly string[]): Promise<void> {
  const resultado = await executarFerramenta(ferramentas.ffmpeg, argumentos, ferramentas.limites);
  if (resultado.codigo !== 0) {
    throw falhaDaFerramenta('ffmpeg', resultado);
  }
}

async function codificarUmaVez(
  ferramentas: FerramentasDeVideo,
  origem: string,
  saida: string,
  plano: PlanoDeVideo,
  kbps: number,
): Promise<number> {
  const codificador: Codificador = saida.endsWith('.mp4') ? 'mp4' : 'webm';
  await rodarFfmpeg(ferramentas, [
    ...argumentosDeEntrada(origem, plano.duracaoMs),
    '-vf',
    FILTRO,
    ...argumentosDoCodificador(codificador, kbps),
    saida,
  ]);
  return (await stat(saida)).size;
}

export async function codificarVideo(
  ferramentas: FerramentasDeVideo,
  origem: string,
  pasta: string,
  plano: PlanoDeVideo,
  nome: 'video.mp4' | 'video.webm',
): Promise<ArquivoGerado> {
  const saida = `${pasta}/${nome}`;
  const kbps = taxaDoVideoKbps(plano.duracaoMs);
  let bytes = await codificarUmaVez(ferramentas, origem, saida, plano, kbps);
  if (bytes > LIMITES_DA_MIDIA.tamanhoMaximoDoDerivadoBytes) {
    const menor = Math.floor(kbps * PARAMETROS_DO_VIDEO.reducaoNaSegundaTentativa);
    bytes = await codificarUmaVez(ferramentas, origem, saida, plano, menor);
  }
  return {
    nome,
    arquivoLocal: saida,
    tipoConteudo: nome === 'video.mp4' ? 'video/mp4' : 'video/webm',
    bytes,
  };
}

export async function extrairCapa(
  ferramentas: FerramentasDeVideo,
  origem: string,
  pasta: string,
  plano: PlanoDeVideo,
): Promise<ArquivoGerado> {
  const saida = `${pasta}/capa.jpg`;
  const instante = Math.min(1000, plano.duracaoMs / 2) / 1000;
  await rodarFfmpeg(ferramentas, [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-protocol_whitelist',
    'file',
    '-ss',
    instante.toFixed(3),
    '-i',
    origem,
    '-map',
    '0:v:0',
    '-frames:v',
    '1',
    '-an',
    '-map_metadata',
    '-1',
    '-vf',
    `scale=-2:'min(${String(LIMITES_DA_MIDIA.alturaMaximaDoVideo)},ih)'`,
    '-q:v',
    '4',
    saida,
  ]);
  return {
    nome: 'capa.jpg',
    arquivoLocal: saida,
    tipoConteudo: 'image/jpeg',
    bytes: (await stat(saida)).size,
  };
}
