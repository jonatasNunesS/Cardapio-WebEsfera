import { CODIGOS, ErroAplicacao, type ArquivosGerados } from '@cardapio/aplicacao';
import { LIMITES_DA_MIDIA, planejarProcessamento, type PlanoDeProcessamento } from '@cardapio/dominio';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  criarProcessadorFfmpeg,
  pastaTemporaria,
  type ConfiguracaoDoProcessador,
} from './processador-ffmpeg.ts';
import { criarAmostras, FFMPEG, FFPROBE, sondarSaida, type Amostras } from './testes/amostras.ts';
import { taxaDoVideoKbps } from './video.ts';

const CONFIGURACAO: ConfiguracaoDoProcessador = {
  ffmpeg: FFMPEG,
  ffprobe: FFPROBE,
  prlimit: process.env.CAMINHO_PRLIMIT ?? 'prlimit',
  tempoMaximoMs: 120_000,
  memoriaMaximaBytes: 2 * 1024 * 1024 * 1024,
};

let amostras: Amostras;
let pasta: string;
const processador = criarProcessadorFfmpeg(CONFIGURACAO);

async function planoPara(arquivo: string, tipo: 'foto' | 'video'): Promise<PlanoDeProcessamento> {
  const plano = planejarProcessamento(tipo, await processador.sondar(arquivo, tipo));
  if (!plano.ok) {
    throw new Error(plano.erro);
  }
  return plano.valor;
}

async function gerar(arquivo: string, tipo: 'foto' | 'video'): Promise<ArquivosGerados> {
  const resultado = await processador.gerar(arquivo, await planoPara(arquivo, tipo), pasta);
  if (!resultado.ok) {
    throw new Error(resultado.erro);
  }
  return resultado.valor;
}

function arquivo(gerados: ArquivosGerados, nome: string) {
  const encontrado = gerados.arquivos.find((item) => item.nome === nome);
  if (encontrado === undefined) {
    throw new Error(`faltou ${nome}`);
  }
  return encontrado;
}

beforeAll(async () => {
  amostras = await criarAmostras();
  pasta = await mkdtemp(path.join(tmpdir(), 'cardapio-saida-'));
}, 60_000);

afterAll(async () => {
  await rm(amostras.pasta, { recursive: true, force: true });
  await rm(pasta, { recursive: true, force: true });
});

describe('processador FFmpeg', { timeout: 120_000 }, () => {
  it('vídeo de 12 s com áudio vira MP4, WebM e capa: até 600 KB, mudo e cortado em 10 s', async () => {
    const gerados = await gerar(amostras.videoLongo, 'video');

    expect(gerados.duracaoMs).toBe(10_000);
    for (const nome of ['video.mp4', 'video.webm', 'capa.jpg']) {
      expect(arquivo(gerados, nome).bytes).toBeLessThanOrEqual(LIMITES_DA_MIDIA.tamanhoMaximoDoDerivadoBytes);
    }
    for (const nome of ['video.mp4', 'video.webm']) {
      const saida = await sondarSaida(arquivo(gerados, nome).arquivoLocal);
      expect(saida.tipos).toEqual(['video']);
      expect(saida.duracaoS).toBeGreaterThan(9.9);
      expect(saida.duracaoS).toBeLessThanOrEqual(10.05);
    }
    expect(gerados.arquivos.map((item) => item.nome)).toEqual([
      'video.mp4',
      'video.webm',
      'capa.jpg',
      'imagem-320.avif',
      'imagem-320.webp',
      'imagem-640.avif',
      'imagem-640.webp',
    ]);
  });

  it('vídeo Full HD sai em 720p e a capa gera os srcset até 1280', async () => {
    const gerados = await gerar(amostras.videoFullHd, 'video');

    expect((await sondarSaida(arquivo(gerados, 'video.mp4').arquivoLocal)).altura).toBe(720);
    expect((await sondarSaida(arquivo(gerados, 'video.webm').arquivoLocal)).altura).toBe(720);
    expect({ largura: gerados.largura, altura: gerados.altura }).toEqual({ largura: 1280, altura: 720 });
    expect(gerados.duracaoMs).toBe(3000);
  });

  it('a sonda lê o conteúdo, não a extensão: só áudio não tem vídeo, texto não é reconhecido', async () => {
    expect(await processador.sondar(amostras.soAudio, 'video')).toMatchObject({ temVideo: false });
    expect(await processador.sondar(amostras.texto, 'video')).toBeNull();
    expect(await processador.sondar(amostras.texto, 'foto')).toBeNull();
    expect(planejarProcessamento('video', await processador.sondar(amostras.soAudio, 'video'))).toEqual({
      ok: false,
      erro: 'sem_video',
    });
  });

  it('foto gera AVIF e WebP nas larguras que cabem', async () => {
    const gerados = await gerar(amostras.foto, 'foto');

    expect(gerados.duracaoMs).toBeNull();
    expect(gerados.arquivos.map((item) => item.nome)).toEqual([
      'imagem-320.avif',
      'imagem-320.webp',
      'imagem-640.avif',
      'imagem-640.webp',
      'imagem-960.avif',
      'imagem-960.webp',
      'imagem-1280.avif',
      'imagem-1280.webp',
    ]);
    expect({ largura: gerados.largura, altura: gerados.altura }).toEqual({ largura: 1280, altura: 960 });
  });

  it('passou do tempo limite: o processo é morto e o erro é definitivo', async () => {
    const lento = criarProcessadorFfmpeg({ ...CONFIGURACAO, tempoMaximoMs: 50 });
    const plano = await planoPara(amostras.videoLongo, 'video');

    const erro = await lento.gerar(amostras.videoLongo, plano, pasta).then(
      () => null,
      (motivo: unknown) => motivo,
    );
    expect(erro).toBeInstanceOf(ErroAplicacao);
    expect((erro as ErroAplicacao).codigo).toBe(CODIGOS.MIDIA_PROCESSAR_TEMPO_ESGOTADO);
  });

  it('memória limitada demais: o FFmpeg falha com erro definitivo em vez de derrubar o worker', async () => {
    const apertado = criarProcessadorFfmpeg({ ...CONFIGURACAO, memoriaMaximaBytes: 32 * 1024 * 1024 });
    const plano = await planoPara(amostras.videoLongo, 'video');

    const erro = await apertado.gerar(amostras.videoLongo, plano, pasta).then(
      () => null,
      (motivo: unknown) => motivo,
    );
    expect((erro as ErroAplicacao).codigo).toBe(CODIGOS.MIDIA_PROCESSAR_FERRAMENTA_FALHOU);
  });

  it('taxa do vídeo cabe no limite com folga para o contêiner', () => {
    expect(taxaDoVideoKbps(10_000)).toBe(400);
    expect(taxaDoVideoKbps(10_000) * 10 * 125).toBeLessThan(LIMITES_DA_MIDIA.tamanhoMaximoDoDerivadoBytes);
  });

  it('a pasta temporária some depois do uso, mesmo com erro', async () => {
    let usada = '';
    await expect(
      pastaTemporaria.comPasta((caminho) => {
        usada = caminho;
        return Promise.reject(new Error('falhou no meio'));
      }),
    ).rejects.toThrow('falhou no meio');
    await expect(sondarSaida(path.join(usada, 'qualquer'))).rejects.toThrow();
    const { access } = await import('node:fs/promises');
    await expect(access(usada)).rejects.toThrow();
  });
});
