import type { ArquivosGerados, PastaTemporaria, ProcessadorDeMidia } from '@cardapio/aplicacao';
import { largurasDaImagem, Resultado, type PlanoDeVideo } from '@cardapio/dominio';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LimitesDaFerramenta } from './ferramenta.ts';
import { gerarImagens } from './imagens.ts';
import { sondarFoto, sondarVideo } from './sonda.ts';
import { codificarVideo, extrairCapa, type FerramentasDeVideo } from './video.ts';

export interface ConfiguracaoDoProcessador {
  readonly ffmpeg: string;
  readonly ffprobe: string;
  readonly prlimit: string | null;
  readonly tempoMaximoMs: number;
  readonly memoriaMaximaBytes: number;
}

async function gerarVideo(
  ferramentas: FerramentasDeVideo,
  origem: string,
  plano: PlanoDeVideo,
  pasta: string,
): Promise<ArquivosGerados> {
  const mp4 = await codificarVideo(ferramentas, origem, pasta, plano, 'video.mp4');
  const webm = await codificarVideo(ferramentas, origem, pasta, plano, 'video.webm');
  const capa = await extrairCapa(ferramentas, origem, pasta, plano);
  const larguraDaCapa = (await sondarFoto(capa.arquivoLocal))?.largura ?? 0;
  const imagens = await gerarImagens(capa.arquivoLocal, pasta, largurasDaImagem(larguraDaCapa));
  return {
    largura: imagens.largura,
    altura: imagens.altura,
    duracaoMs: plano.duracaoMs,
    arquivos: [mp4, webm, capa, ...imagens.arquivos],
  };
}

export function criarProcessadorFfmpeg(configuracao: ConfiguracaoDoProcessador): ProcessadorDeMidia {
  const limites: LimitesDaFerramenta = {
    tempoMs: configuracao.tempoMaximoMs,
    memoriaBytes: configuracao.memoriaMaximaBytes,
    prlimit: configuracao.prlimit,
  };
  const ferramentas: FerramentasDeVideo = { ffmpeg: configuracao.ffmpeg, limites };
  return {
    sondar: (arquivo, tipo) =>
      tipo === 'foto' ? sondarFoto(arquivo) : sondarVideo(configuracao.ffprobe, arquivo, limites),
    async gerar(arquivo, plano, pasta) {
      if (plano.tipo === 'video') {
        return Resultado.ok(await gerarVideo(ferramentas, arquivo, plano, pasta));
      }
      const imagens = await gerarImagens(arquivo, pasta, plano.larguras);
      return Resultado.ok({ ...imagens, duracaoMs: null });
    },
  };
}

export const pastaTemporaria: PastaTemporaria = {
  async comPasta(executar) {
    const pasta = await mkdtemp(path.join(tmpdir(), 'cardapio-midia-'));
    try {
      return await executar(pasta);
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  },
};
