import type { SondaDeVideo, SondaDoArquivo } from '@cardapio/dominio';
import sharp from 'sharp';
import { executarFerramenta, type LimitesDaFerramenta } from './ferramenta.ts';

export const PIXELS_MAXIMOS_DA_FOTO = 8000 * 8000;
const ORIENTACAO_QUE_GIRA = 5;

interface FluxoDoFfprobe {
  readonly codec_type?: string;
  readonly width?: number;
  readonly height?: number;
  readonly disposition?: { readonly attached_pic?: number };
}

interface SaidaDoFfprobe {
  readonly format?: { readonly format_name?: string; readonly duration?: string };
  readonly streams?: readonly FluxoDoFfprobe[];
}

function ehVideoDeVerdade(fluxo: FluxoDoFfprobe): boolean {
  return fluxo.codec_type === 'video' && fluxo.disposition?.attached_pic !== 1;
}

export function lerSaidaDoFfprobe(json: string): SondaDeVideo | null {
  const dados = JSON.parse(json) as SaidaDoFfprobe;
  const formato = dados.format?.format_name;
  if (formato === undefined) {
    return null;
  }
  const video = (dados.streams ?? []).find(ehVideoDeVerdade);
  const segundos = Number(dados.format?.duration);
  return {
    tipo: 'video',
    formato,
    temVideo: video !== undefined,
    duracaoMs: Number.isFinite(segundos) && segundos > 0 ? Math.round(segundos * 1000) : null,
    largura: video?.width ?? 0,
    altura: video?.height ?? 0,
  };
}

export async function sondarVideo(
  ffprobe: string,
  arquivo: string,
  limites: LimitesDaFerramenta,
): Promise<SondaDeVideo | null> {
  const resultado = await executarFerramenta(
    ffprobe,
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      arquivo,
    ],
    limites,
  );
  return resultado.codigo === 0 ? lerSaidaDoFfprobe(resultado.saida) : null;
}

export async function sondarFoto(arquivo: string): Promise<SondaDoArquivo | null> {
  const metadados = await sharp(arquivo, { limitInputPixels: PIXELS_MAXIMOS_DA_FOTO, failOn: 'error' })
    .metadata()
    .then(
      (lidos) => lidos,
      () => null,
    );
  if (metadados === null) {
    return null;
  }
  const deitada = (metadados.orientation ?? 1) >= ORIENTACAO_QUE_GIRA;
  return {
    tipo: 'foto',
    formato: metadados.format,
    largura: deitada ? metadados.height : metadados.width,
    altura: deitada ? metadados.width : metadados.height,
  };
}
