import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const executar = promisify(execFile);

export const FFMPEG = process.env.CAMINHO_FFMPEG ?? 'ffmpeg';
export const FFPROBE = process.env.CAMINHO_FFPROBE ?? 'ffprobe';

export interface Amostras {
  readonly pasta: string;
  readonly videoLongo: string;
  readonly videoFullHd: string;
  readonly soAudio: string;
  readonly texto: string;
  readonly foto: string;
}

async function gerarVideo(destino: string, tamanho: string, segundos: number): Promise<void> {
  await executar(FFMPEG, [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${tamanho}:rate=30`,
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440',
    '-t',
    String(segundos),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    '-shortest',
    destino,
  ]);
}

export async function criarAmostras(): Promise<Amostras> {
  const pasta = await mkdtemp(path.join(tmpdir(), 'cardapio-amostras-'));
  const amostras: Amostras = {
    pasta,
    videoLongo: path.join(pasta, 'longo.mp4'),
    videoFullHd: path.join(pasta, 'full-hd.mov'),
    soAudio: path.join(pasta, 'so-audio.mp4'),
    texto: path.join(pasta, 'texto.mp4'),
    foto: path.join(pasta, 'foto.jpg'),
  };
  await gerarVideo(amostras.videoLongo, '640x360', 12);
  await gerarVideo(amostras.videoFullHd, '1920x1080', 3);
  await executar(FFMPEG, [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440',
    '-t',
    '3',
    '-c:a',
    'aac',
    amostras.soAudio,
  ]);
  await writeFile(amostras.texto, '<html>não sou vídeo</html>');
  await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 180, g: 68, b: 31 } } })
    .jpeg()
    .toFile(amostras.foto);
  return amostras;
}

export interface SondaDeSaida {
  readonly tipos: readonly string[];
  readonly duracaoS: number;
  readonly altura: number;
}

export async function sondarSaida(arquivo: string): Promise<SondaDeSaida> {
  const { stdout } = await executar(FFPROBE, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    arquivo,
  ]);
  const dados = JSON.parse(stdout) as {
    format: { duration: string };
    streams: { codec_type: string; height?: number }[];
  };
  return {
    tipos: dados.streams.map((fluxo) => fluxo.codec_type),
    duracaoS: Number(dados.format.duration),
    altura: dados.streams.find((fluxo) => fluxo.codec_type === 'video')?.height ?? 0,
  };
}
